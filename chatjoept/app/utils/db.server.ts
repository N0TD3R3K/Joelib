// Cloudflare D1 Database Server Utilities for ChatJoePT
// Manages:
// 1. User profiles synced from JoeAuth (sub, email, name, picture)
// 2. Sliding-window API usage tracking & limits ($0.25 USD / 5h, $2.00 USD / 7d)
// 3. Visible dialogs & hidden shared snapshot dialogs with exact Storage Credit accounting
//    - Pool: 16,384 credits (Soft limit: 16,000, Hard limit: 16,384)
//    - Normal chat credit: 256 + ceil(bytes / 1024)
//    - Shared snapshot credit: 32 + ceil(bytes / 1024)

import type { ChatSession, Message, SharedLinkSummary, UserQuotas } from "~/types/chat";

export const STORAGE_CREDIT_SOFT_LIMIT = 16000;
export const STORAGE_CREDIT_HARD_LIMIT = 16384;
export const CHAT_BASE_CREDIT = 256;
export const SHARE_BASE_CREDIT = 32;

export const USAGE_LIMIT_USD_5H = 0.25; // $0.25 USD per sliding 5-hour window
export const USAGE_LIMIT_USD_7D = 2.0;  // $2.00 USD per sliding 7-day window
export const USAGE_WINDOW_5H_MS = 5 * 60 * 60 * 1000;
export const USAGE_WINDOW_7D_MS = 7 * 24 * 60 * 60 * 1000;

// DeepSeek Peak Pricing (USD per 1M tokens, applied at all times)
export const DEEPSEEK_CACHE_MISS_PRICE_PER_M = 0.3;
export const DEEPSEEK_CACHE_HIT_PRICE_PER_M = 0.006;
export const DEEPSEEK_OUTPUT_PRICE_PER_M = 1.2;

// DeepSeek File Parsing Pricing & Active Object-Storage Cap
export const DEEPSEEK_FILE_PARSE_PRICE_PER_1K_PAGES = 0.225;
export const MAX_UPLOADED_STORAGE_BYTES = 128 * 1024 * 1024; // 128 MiB per account

const textEncoder = new TextEncoder();

function getEnv(env?: any): Record<string, any> {
  if (env) return env;
  const g = globalThis as any;
  if (g.__CF_ENV__) return g.__CF_ENV__;
  if (g.process && g.process.env) return g.process.env;
  return {};
}

function getDB(env?: any): D1Database {
  const e = getEnv(env);
  if (!e || !e.CHATJOEPT_DB) {
    throw new Error("D1 binding CHATJOEPT_DB is not configured.");
  }
  return e.CHATJOEPT_DB as D1Database;
}

export function utf8ByteLength(str: string): number {
  return textEncoder.encode(str).length;
}

export function computeChatCredits(sizeBytes: number): number {
  return CHAT_BASE_CREDIT + Math.ceil(Math.max(0, sizeBytes) / 1024);
}

export function computeShareCredits(sizeBytes: number): number {
  return SHARE_BASE_CREDIT + Math.ceil(Math.max(0, sizeBytes) / 1024);
}

// -------------------------------------------------------------
// 1. Users
// -------------------------------------------------------------

export async function upsertUser(
  user: { sub: string; email: string; name?: string; picture?: string },
  env?: any
): Promise<void> {
  const db = getDB(env);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, picture, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         picture = excluded.picture,
         updated_at = excluded.updated_at`
    )
    .bind(
      user.sub,
      user.email,
      user.name || null,
      user.picture || null,
      now,
      now
    )
    .run();
}

export async function ensureUserExists(
  user: { sub: string; email: string; name?: string; picture?: string },
  env?: any
): Promise<void> {
  const db = getDB(env);
  const existing = await db
    .prepare(`SELECT id FROM users WHERE id = ?`)
    .bind(user.sub)
    .first();
  if (!existing) {
    await upsertUser(user, env);
  }
}

// -------------------------------------------------------------
// 2. Sliding-Window Usage Tracking & Cost Caps (5h / 7d USD)
// -------------------------------------------------------------

export function calculateCostUsd(usage: {
  promptTokens?: number;
  completionTokens?: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
}): number {
  const hitTokens = Math.max(0, usage.promptCacheHitTokens || 0);
  const missTokens = Math.max(
    0,
    usage.promptCacheMissTokens !== undefined
      ? usage.promptCacheMissTokens
      : (usage.promptTokens || 0) - hitTokens
  );
  const outTokens = Math.max(0, usage.completionTokens || 0);

  const inputCost =
    (missTokens * DEEPSEEK_CACHE_MISS_PRICE_PER_M +
      hitTokens * DEEPSEEK_CACHE_HIT_PRICE_PER_M) /
    1_000_000;
  const outputCost = (outTokens * DEEPSEEK_OUTPUT_PRICE_PER_M) / 1_000_000;

  return inputCost + outputCost;
}

export async function getUserSlidingWindowUsage(
  userId: string,
  env?: any
): Promise<{
  cost5hUsd: number;
  cost7dUsd: number;
  usage5hPercent: number;
  usage7dPercent: number;
}> {
  if (!userId) {
    return { cost5hUsd: 0, cost7dUsd: 0, usage5hPercent: 0, usage7dPercent: 0 };
  }
  const db = getDB(env);
  const now = Date.now();
  const cutoff5h = now - USAGE_WINDOW_5H_MS;
  const cutoff7d = now - USAGE_WINDOW_7D_MS;

  // usage_records.cost_cny column stores tracked request cost in USD
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN created_at >= ? THEN cost_cny ELSE 0 END), 0) AS cost_5h,
         COALESCE(SUM(cost_cny), 0) AS cost_7d
       FROM usage_records
       WHERE user_id = ? AND created_at >= ?`
    )
    .bind(cutoff5h, userId, cutoff7d)
    .first<{ cost_5h: number; cost_7d: number }>();

  const cost5hUsd = Number(row?.cost_5h || 0);
  const cost7dUsd = Number(row?.cost_7d || 0);
  const usage5hPercent = Math.min(
    100,
    Math.round((cost5hUsd / USAGE_LIMIT_USD_5H) * 100)
  );
  const usage7dPercent = Math.min(
    100,
    Math.round((cost7dUsd / USAGE_LIMIT_USD_7D) * 100)
  );

  return { cost5hUsd, cost7dUsd, usage5hPercent, usage7dPercent };
}

export async function checkUserUsageAllowed(
  userId: string,
  env?: any
): Promise<{
  allowed: boolean;
  exceededWindow: "5h" | "7d" | null;
  usage5hPercent: number;
  usage7dPercent: number;
}> {
  const { cost5hUsd, cost7dUsd, usage5hPercent, usage7dPercent } =
    await getUserSlidingWindowUsage(userId, env);

  const allowed5h = cost5hUsd < USAGE_LIMIT_USD_5H;
  const allowed7d = cost7dUsd < USAGE_LIMIT_USD_7D;

  return {
    allowed: allowed5h && allowed7d,
    exceededWindow: !allowed5h ? "5h" : !allowed7d ? "7d" : null,
    usage5hPercent,
    usage7dPercent,
  };
}

export async function recordUserUsage(
  userId: string,
  costUsd: number,
  tokens: number,
  env?: any
): Promise<void> {
  if (!userId || costUsd <= 0) return;
  const db = getDB(env);
  const now = Date.now();
  const id = `use_${crypto.randomUUID().replace(/-/g, "")}`;
  const pruneBefore = now - 8 * 24 * 60 * 60 * 1000;

  await db.batch([
    db
      .prepare(
        `INSERT INTO usage_records (id, user_id, cost_cny, tokens, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, userId, costUsd, tokens, now),
    db
      .prepare(`DELETE FROM usage_records WHERE user_id = ? AND created_at < ?`)
      .bind(userId, pruneBefore),
  ]);
}

// -------------------------------------------------------------
// 3. Storage Credit Accounting & Percentage Quotas
// -------------------------------------------------------------

interface DialogCreditRow {
  id: string;
  size_bytes: number;
  is_hidden: number;
}

async function getUserCreditBreakdown(
  userId: string,
  env?: any,
  excludeDialogId?: string
): Promise<{
  chatCredits: number;
  shareCredits: number;
  totalCredits: number;
  hasDialogId: boolean;
}> {
  const db = getDB(env);
  const { results } = await db
    .prepare(`SELECT id, size_bytes, is_hidden FROM dialogs WHERE user_id = ?`)
    .bind(userId)
    .all<DialogCreditRow>();

  let chatCredits = 0;
  let shareCredits = 0;
  let hasDialogId = false;

  for (const row of results || []) {
    if (row.id === excludeDialogId) {
      hasDialogId = true;
      continue;
    }
    if (row.is_hidden === 1) {
      shareCredits += computeShareCredits(row.size_bytes);
    } else {
      chatCredits += computeChatCredits(row.size_bytes);
    }
  }

  return {
    chatCredits,
    shareCredits,
    totalCredits: chatCredits + shareCredits,
    hasDialogId,
  };
}

export async function getRemainingDialogBytesBudget(
  userId: string,
  dialogId: string | undefined,
  env?: any
): Promise<{
  isSoftLimited: boolean;
  isHardLimited: boolean;
  remainingBytesForDialog: number;
}> {
  if (!userId) {
    return {
      isSoftLimited: false,
      isHardLimited: false,
      remainingBytesForDialog: 16 * 1024 * 1024,
    };
  }

  const allStats = await getUserCreditBreakdown(userId, env);
  const otherStats = dialogId
    ? await getUserCreditBreakdown(userId, env, dialogId)
    : allStats;

  const remainingCredits = Math.max(0, STORAGE_CREDIT_HARD_LIMIT - otherStats.totalCredits);
  const remainingDataCredits = Math.max(0, remainingCredits - CHAT_BASE_CREDIT);

  return {
    isSoftLimited: allStats.totalCredits >= STORAGE_CREDIT_SOFT_LIMIT,
    isHardLimited: allStats.totalCredits >= STORAGE_CREDIT_HARD_LIMIT,
    remainingBytesForDialog: remainingDataCredits * 1024,
  };
}

export async function getUserQuotas(
  userId: string,
  env?: any
): Promise<UserQuotas> {
  if (!userId) {
    return {
      usage5hPercent: 0,
      usage7dPercent: 0,
      uploadedFilesBytes: 0,
      uploadedFilesPercent: 0,
      chatPercent: 0,
      sharePercent: 0,
      freePercent: 100,
      isSoftLimited: false,
      isHardLimited: false,
    };
  }

  const [usage, credits, uploadedFilesBytes] = await Promise.all([
    getUserSlidingWindowUsage(userId, env),
    getUserCreditBreakdown(userId, env),
    getUserUploadedFilesBytes(userId, env),
  ]);

  const uploadedFilesPercent = Math.min(
    100,
    Math.round((uploadedFilesBytes / MAX_UPLOADED_STORAGE_BYTES) * 1000) / 10
  );

  const rawChatPct = Math.min(
    100,
    (credits.chatCredits / STORAGE_CREDIT_HARD_LIMIT) * 100
  );
  const chatPercent = Math.round(rawChatPct * 10) / 10;

  const rawSharePct = Math.min(
    Math.max(0, 100 - chatPercent),
    (credits.shareCredits / STORAGE_CREDIT_HARD_LIMIT) * 100
  );
  const sharePercent = Math.round(rawSharePct * 10) / 10;

  const freePercent = Math.max(
    0,
    Math.round((100 - chatPercent - sharePercent) * 10) / 10
  );

  return {
    usage5hPercent: usage.usage5hPercent,
    usage7dPercent: usage.usage7dPercent,
    uploadedFilesBytes,
    uploadedFilesPercent,
    chatPercent,
    sharePercent,
    freePercent,
    isSoftLimited: credits.totalCredits >= STORAGE_CREDIT_SOFT_LIMIT,
    isHardLimited: credits.totalCredits >= STORAGE_CREDIT_HARD_LIMIT,
  };
}

// -------------------------------------------------------------
// 3b. Uploaded Object-Storage Quota & File Parsing Billing
// -------------------------------------------------------------

export function calculateFileParsingCostUsd(pageCount: number): number {
  const safePages = Math.max(1, Math.ceil(pageCount));
  return (safePages * DEEPSEEK_FILE_PARSE_PRICE_PER_1K_PAGES) / 1000;
}

export function estimateDocumentPageCount(
  bytes: Uint8Array,
  filename: string,
  mimeType?: string
): number {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    try {
      const latin1 = new TextDecoder("latin1").decode(bytes);
      const matches = latin1.match(/\/Type\s*\/Page\b(?!s\b)/g);
      if (matches && matches.length > 0) {
        return matches.length;
      }
    } catch {
      // Fall back to byte heuristic
    }
  }
  return Math.max(1, Math.ceil(bytes.byteLength / 32768));
}

export async function getUserUploadedFilesBytes(
  userId: string,
  env?: any
): Promise<number> {
  if (!userId) return 0;
  const db = getDB(env);
  try {
    const row = await db
      .prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS total_bytes FROM user_files WHERE user_id = ?`)
      .bind(userId)
      .first<{ total_bytes: number }>();
    return Number(row?.total_bytes || 0);
  } catch {
    // Graceful fallback if table hasn't been migrated yet
    return 0;
  }
}

export async function findExistingUploadedFileByHash(
  userId: string,
  purpose: string,
  contentHash: string,
  env?: any
): Promise<{ id: string; filename: string; purpose: string; sizeBytes: number } | null> {
  if (!userId || !purpose || !contentHash) return null;
  const db = getDB(env);
  try {
    const row = await db
      .prepare(
        `SELECT id, filename, purpose, size_bytes
         FROM user_files
         WHERE user_id = ? AND purpose = ? AND content_hash = ?
         LIMIT 1`
      )
      .bind(userId, purpose, contentHash)
      .first<{ id: string; filename: string; purpose: string; size_bytes: number }>();
    if (!row) return null;
    return {
      id: row.id,
      filename: row.filename,
      purpose: row.purpose,
      sizeBytes: Number(row.size_bytes || 0),
    };
  } catch {
    return null;
  }
}

export async function registerUploadedUserFile(
  userId: string,
  file: {
    id: string;
    filename: string;
    purpose: string;
    sizeBytes: number;
    contentHash?: string;
  },
  env?: any
): Promise<void> {
  if (!userId || !file.id) return;
  const db = getDB(env);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO user_files (id, user_id, filename, purpose, size_bytes, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         filename = excluded.filename,
         purpose = excluded.purpose,
         size_bytes = excluded.size_bytes,
         content_hash = COALESCE(excluded.content_hash, user_files.content_hash)`
    )
    .bind(
      file.id,
      userId,
      file.filename,
      file.purpose,
      file.sizeBytes,
      file.contentHash || null,
      now
    )
    .run();
}

export function extractFileIdsFromMessagesJson(messagesJson: string): string[] {
  if (!messagesJson) return [];
  const ids = new Set<string>();
  try {
    const messages = JSON.parse(messagesJson) as Message[];
    if (Array.isArray(messages)) {
      for (const m of messages) {
        if (Array.isArray(m?.attachments)) {
          for (const att of m.attachments) {
            if (att?.fileId && typeof att.fileId === "string") {
              ids.add(att.fileId);
            }
          }
        }
      }
    }
  } catch {
    // Ignore malformed JSON
  }
  return Array.from(ids);
}

export async function deleteRemoteDeepSeekFiles(
  fileIds: string[],
  env?: any
): Promise<void> {
  if (fileIds.length === 0) return;
  const e = getEnv(env);
  const apiKey = (e.LLM_API_KEY || "").trim();
  if (!apiKey) return;
  const rawBaseUrl = (e.LLM_API_URL || "https://api.deepseek.com").trim();
  const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

  await Promise.allSettled(
    fileIds.map((fileId) =>
      fetch(`${baseUrl}/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apiKey}` },
      })
    )
  );
}

async function cleanupCandidateFileIds(
  userId: string,
  candidateFileIds: string[],
  env?: any
): Promise<void> {
  if (!userId || candidateFileIds.length === 0) return;
  const uniqueCandidates = Array.from(new Set(candidateFileIds.filter(Boolean)));
  if (uniqueCandidates.length === 0) return;

  const db = getDB(env);
  const { results } = await db
    .prepare(`SELECT messages_json FROM dialogs WHERE user_id = ?`)
    .bind(userId)
    .all<{ messages_json: string }>();

  const stillReferenced = new Set<string>();
  for (const row of results || []) {
    for (const fid of extractFileIdsFromMessagesJson(row.messages_json)) {
      stillReferenced.add(fid);
    }
  }

  const orphanedIds = uniqueCandidates.filter((id) => !stillReferenced.has(id));
  if (orphanedIds.length === 0) return;

  const placeholders = orphanedIds.map(() => "?").join(", ");
  await db
    .prepare(`DELETE FROM user_files WHERE user_id = ? AND id IN (${placeholders})`)
    .bind(userId, ...orphanedIds)
    .run();

  await deleteRemoteDeepSeekFiles(orphanedIds, env);
}

export async function deleteUploadedUserFile(
  userId: string,
  fileId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId || !fileId) return { success: false };
  const db = getDB(env);

  const existing = await db
    .prepare(`SELECT id FROM user_files WHERE id = ? AND user_id = ?`)
    .bind(fileId, userId)
    .first<{ id: string }>();
  if (!existing) return { success: false };

  // Keep file if any saved visible or shared dialog still references it
  const { results } = await db
    .prepare(`SELECT messages_json FROM dialogs WHERE user_id = ?`)
    .bind(userId)
    .all<{ messages_json: string }>();

  for (const row of results || []) {
    if (extractFileIdsFromMessagesJson(row.messages_json).includes(fileId)) {
      return { success: false };
    }
  }

  await db
    .prepare(`DELETE FROM user_files WHERE id = ? AND user_id = ?`)
    .bind(fileId, userId)
    .run();

  await deleteRemoteDeepSeekFiles([fileId], env);
  return { success: true };
}

// -------------------------------------------------------------
// 4. Visible User Dialogs CRUD + Hard Limit Truncation
// -------------------------------------------------------------

interface DialogRow {
  id: string;
  user_id: string;
  title: string;
  model: string;
  messages_json: string;
  size_bytes: number;
  is_hidden: number;
  source_dialog_id: string | null;
  created_at: number;
  updated_at: number;
}

export async function getAllUserDialogs(
  userId: string,
  env?: any
): Promise<ChatSession[]> {
  if (!userId) return [];
  const db = getDB(env);
  const { results } = await db
    .prepare(
      `SELECT id, title, model, messages_json, created_at, updated_at
       FROM dialogs
       WHERE user_id = ? AND is_hidden = 0
       ORDER BY updated_at DESC`
    )
    .bind(userId)
    .all<DialogRow>();

  return (results || []).map((row) => {
    let messages: Message[] = [];
    try {
      messages = JSON.parse(row.messages_json);
    } catch {
      messages = [];
    }
    return {
      id: row.id,
      title: row.title,
      model: row.model,
      messages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

function fitMessagesToByteBudget(
  messages: Message[],
  maxBytes: number
): { messages: Message[]; truncated: boolean } {
  let currentJson = JSON.stringify(messages);
  if (utf8ByteLength(currentJson) <= maxBytes) {
    return { messages, truncated: false };
  }

  const clone: Message[] = messages.map((m) => ({
    ...m,
    attachments: m.attachments ? [...m.attachments] : undefined,
  }));

  // Step 1: Trim trailing text on the newest message first using binary search
  if (clone.length > 0) {
    const last = clone[clone.length - 1];
    if (last.attachments && last.attachments.length > 0) {
      delete last.attachments;
      if (utf8ByteLength(JSON.stringify(clone)) <= maxBytes) {
        return { messages: clone, truncated: true };
      }
    }

    const suffix = "\n\n*[Truncated: storage limit reached]*";
    const original = last.content || "";
    let low = 0;
    let high = original.length;
    let best = 0;

    while (low <= high) {
      const mid = (low + high) >> 1;
      // Avoid splitting UTF-16 surrogate pairs
      let end = mid;
      if (end > 0 && end < original.length) {
        const code = original.charCodeAt(end - 1);
        if (code >= 0xd800 && code <= 0xdbff) {
          end -= 1;
        }
      }
      last.content = original.slice(0, end) + suffix;
      if (utf8ByteLength(JSON.stringify(clone)) <= maxBytes) {
        best = end;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    last.content = original.slice(0, best) + suffix;
    if (utf8ByteLength(JSON.stringify(clone)) <= maxBytes) {
      return { messages: clone, truncated: true };
    }
    last.content = "";
  }

  // Step 2: If even with empty last message it still exceeds budget, pop newest messages
  while (clone.length > 0 && utf8ByteLength(JSON.stringify(clone)) > maxBytes) {
    clone.pop();
  }

  return { messages: clone, truncated: true };
}

export async function saveUserDialog(
  userId: string,
  dialog: ChatSession,
  env?: any,
  options?: { allowPastSoftLimit?: boolean }
): Promise<{
  success: boolean;
  truncated?: boolean;
  savedDialog?: ChatSession;
  error?: string;
}> {
  if (!userId || !dialog || !dialog.id) {
    return { success: false, error: "Missing required dialog parameters" };
  }

  const db = getDB(env);
  const allBefore = await getUserCreditBreakdown(userId, env);
  const otherCreditsInfo = await getUserCreditBreakdown(userId, env, dialog.id);

  // Soft limit blocks creating new chats or appending new prompts unless an in-flight response is completing
  if (
    allBefore.totalCredits >= STORAGE_CREDIT_SOFT_LIMIT &&
    !options?.allowPastSoftLimit
  ) {
    return {
      success: false,
      error:
        "Memory soft limit reached. Please delete older chats or shared links in Settings to create or continue conversations.",
    };
  }

  // Check if remaining credits allow even the 256-credit base cost of a brand new dialog
  const maxCreditsForThisChat = Math.max(
    0,
    STORAGE_CREDIT_HARD_LIMIT - otherCreditsInfo.totalCredits
  );
  if (maxCreditsForThisChat < CHAT_BASE_CREDIT) {
    return {
      success: false,
      error:
        "Memory hard limit reached. Insufficient remaining space to store this conversation.",
    };
  }

  const maxBytesForThisChat = (maxCreditsForThisChat - CHAT_BASE_CREDIT) * 1024;

  // Truncate cleanly if saving would exceed hard limit 16,384
  const rawMessages = Array.isArray(dialog.messages) ? dialog.messages : [];
  const { messages: finalMessages, truncated } = fitMessagesToByteBudget(
    rawMessages,
    maxBytesForThisChat
  );

  const messagesJson = JSON.stringify(finalMessages);
  const sizeBytes = utf8ByteLength(messagesJson);
  const now = Date.now();
  const title = (dialog.title || "New chat").slice(0, 120);
  const model = dialog.model || "jpt-6.1-sol";
  const createdAt = dialog.createdAt || now;
  const updatedAt = dialog.updatedAt || now;

  // Collect previously referenced file_ids before overwriting so orphaned files are cleaned up
  const prevRow = await db
    .prepare(
      `SELECT messages_json FROM dialogs WHERE id = ? AND user_id = ? AND is_hidden = 0`
    )
    .bind(dialog.id, userId)
    .first<{ messages_json: string }>();
  const prevFileIds = prevRow
    ? extractFileIdsFromMessagesJson(prevRow.messages_json)
    : [];

  await db
    .prepare(
      `INSERT INTO dialogs (
         id, user_id, title, model, messages_json, size_bytes, is_hidden, source_dialog_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         model = excluded.model,
         messages_json = excluded.messages_json,
         size_bytes = excluded.size_bytes,
         updated_at = excluded.updated_at
       WHERE dialogs.user_id = excluded.user_id AND dialogs.is_hidden = 0`
    )
    .bind(
      dialog.id,
      userId,
      title,
      model,
      messagesJson,
      sizeBytes,
      createdAt,
      updatedAt
    )
    .run();

  if (prevFileIds.length > 0) {
    const nextFileIds = new Set(extractFileIdsFromMessagesJson(messagesJson));
    const removedFileIds = prevFileIds.filter((id) => !nextFileIds.has(id));
    if (removedFileIds.length > 0) {
      await cleanupCandidateFileIds(userId, removedFileIds, env);
    }
  }

  return {
    success: true,
    truncated,
    savedDialog: {
      id: dialog.id,
      title,
      model,
      messages: finalMessages,
      createdAt,
      updatedAt,
    },
  };
}

export async function deleteUserDialog(
  userId: string,
  dialogId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId || !dialogId) return { success: false };
  const db = getDB(env);
  const row = await db
    .prepare(
      `SELECT messages_json FROM dialogs WHERE id = ? AND user_id = ? AND is_hidden = 0`
    )
    .bind(dialogId, userId)
    .first<{ messages_json: string }>();

  const candidateIds = row ? extractFileIdsFromMessagesJson(row.messages_json) : [];

  await db
    .prepare(`DELETE FROM dialogs WHERE id = ? AND user_id = ? AND is_hidden = 0`)
    .bind(dialogId, userId)
    .run();

  await cleanupCandidateFileIds(userId, candidateIds, env);
  return { success: true };
}

export async function deleteAllVisibleChats(
  userId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };
  const db = getDB(env);
  const { results } = await db
    .prepare(`SELECT messages_json FROM dialogs WHERE user_id = ? AND is_hidden = 0`)
    .bind(userId)
    .all<{ messages_json: string }>();

  const candidateIds = (results || []).flatMap((r) =>
    extractFileIdsFromMessagesJson(r.messages_json)
  );

  await db
    .prepare(`DELETE FROM dialogs WHERE user_id = ? AND is_hidden = 0`)
    .bind(userId)
    .run();

  await cleanupCandidateFileIds(userId, candidateIds, env);
  return { success: true };
}

export async function deleteAllUserData(
  userId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };
  const db = getDB(env);
  const { results } = await db
    .prepare(`SELECT id FROM user_files WHERE user_id = ?`)
    .bind(userId)
    .all<{ id: string }>()
    .catch(() => ({ results: [] as { id: string }[] }));

  await db.batch([
    db.prepare(`DELETE FROM shared_links WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM dialogs WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM user_files WHERE user_id = ?`).bind(userId),
  ]);

  await deleteRemoteDeepSeekFiles(
    (results || []).map((r) => r.id),
    env
  );
  return { success: true };
}

export async function deleteUserAccount(
  userId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };
  const db = getDB(env);
  const { results } = await db
    .prepare(`SELECT id FROM user_files WHERE user_id = ?`)
    .bind(userId)
    .all<{ id: string }>()
    .catch(() => ({ results: [] as { id: string }[] }));

  await db.batch([
    db.prepare(`DELETE FROM shared_links WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM usage_records WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM user_files WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM dialogs WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId),
  ]);

  await deleteRemoteDeepSeekFiles(
    (results || []).map((r) => r.id),
    env
  );
  return { success: true };
}

// -------------------------------------------------------------
// 5. Public Shared Snapshots (Hidden Chats) & Management
// -------------------------------------------------------------

export interface SharedDialogView {
  shareId: string;
  title: string;
  model: string;
  createdAt: number;
  messages: Message[];
}

export async function createSharedSnapshot(
  userId: string,
  dialog: ChatSession,
  env?: any
): Promise<{ success: boolean; shareId?: string; error?: string }> {
  if (!userId || !dialog || !dialog.messages || dialog.messages.length === 0) {
    return { success: false, error: "Cannot share an empty conversation." };
  }

  const db = getDB(env);
  const creditsBefore = await getUserCreditBreakdown(userId, env);

  const messagesJson = JSON.stringify(dialog.messages);
  const sizeBytes = utf8ByteLength(messagesJson);
  const snapshotCredits = computeShareCredits(sizeBytes);

  if (
    creditsBefore.totalCredits >= STORAGE_CREDIT_SOFT_LIMIT ||
    creditsBefore.totalCredits + snapshotCredits > STORAGE_CREDIT_SOFT_LIMIT
  ) {
    return {
      success: false,
      error:
        "Memory soft limit reached. Delete old chats or shared links in Settings before creating a new share link.",
    };
  }

  const now = Date.now();
  const snapshotDialogId = `snap_${crypto.randomUUID().replace(/-/g, "")}`;
  const shareId = `sh_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const title = (dialog.title || "Shared chat").slice(0, 120);
  const model = dialog.model || "jpt-6.1-sol";

  await db.batch([
    db
      .prepare(
        `INSERT INTO dialogs (
           id, user_id, title, model, messages_json, size_bytes, is_hidden, source_dialog_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .bind(
        snapshotDialogId,
        userId,
        title,
        model,
        messagesJson,
        sizeBytes,
        dialog.id || null,
        now,
        now
      ),
    db
      .prepare(
        `INSERT INTO shared_links (
           share_id, user_id, snapshot_dialog_id, source_dialog_id, created_at
         ) VALUES (?, ?, ?, ?, ?)`
      )
      .bind(shareId, userId, snapshotDialogId, dialog.id || null, now),
  ]);

  return { success: true, shareId };
}

export async function listUserSharedLinks(
  userId: string,
  env?: any
): Promise<SharedLinkSummary[]> {
  if (!userId) return [];
  const db = getDB(env);

  const { results } = await db
    .prepare(
      `SELECT s.share_id, s.snapshot_dialog_id, s.source_dialog_id, s.created_at,
              d.title, d.model, d.messages_json, d.size_bytes
       FROM shared_links s
       JOIN dialogs d ON s.snapshot_dialog_id = d.id
       WHERE s.user_id = ?
       ORDER BY s.created_at DESC`
    )
    .bind(userId)
    .all<{
      share_id: string;
      snapshot_dialog_id: string;
      source_dialog_id: string | null;
      created_at: number;
      title: string;
      model: string;
      messages_json: string;
      size_bytes: number;
    }>();

  return (results || []).map((row) => {
    let messageCount = 0;
    try {
      const parsed = JSON.parse(row.messages_json);
      if (Array.isArray(parsed)) messageCount = parsed.length;
    } catch {
      messageCount = 0;
    }

    const credits = computeShareCredits(row.size_bytes);
    const memoryPercent =
      Math.round((credits / STORAGE_CREDIT_HARD_LIMIT) * 1000) / 10;

    return {
      shareId: row.share_id,
      snapshotDialogId: row.snapshot_dialog_id,
      sourceDialogId: row.source_dialog_id,
      title: row.title,
      model: row.model,
      messageCount,
      memoryPercent,
      createdAt: row.created_at,
    };
  });
}

export async function deleteUserSharedLink(
  userId: string,
  shareId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId || !shareId) return { success: false };
  const db = getDB(env);

  const row = await db
    .prepare(
      `SELECT s.snapshot_dialog_id, d.messages_json
       FROM shared_links s
       LEFT JOIN dialogs d ON s.snapshot_dialog_id = d.id AND d.user_id = s.user_id
       WHERE s.share_id = ? AND s.user_id = ?`
    )
    .bind(shareId, userId)
    .first<{ snapshot_dialog_id: string; messages_json: string | null }>();

  if (!row) return { success: false };

  const candidateIds = row.messages_json
    ? extractFileIdsFromMessagesJson(row.messages_json)
    : [];

  await db.batch([
    db
      .prepare(`DELETE FROM shared_links WHERE share_id = ? AND user_id = ?`)
      .bind(shareId, userId),
    db
      .prepare(`DELETE FROM dialogs WHERE id = ? AND user_id = ? AND is_hidden = 1`)
      .bind(row.snapshot_dialog_id, userId),
  ]);

  await cleanupCandidateFileIds(userId, candidateIds, env);
  return { success: true };
}

export async function deleteAllUserSharedLinks(
  userId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };
  const db = getDB(env);

  const { results } = await db
    .prepare(`SELECT messages_json FROM dialogs WHERE user_id = ? AND is_hidden = 1`)
    .bind(userId)
    .all<{ messages_json: string }>();

  const candidateIds = (results || []).flatMap((r) =>
    extractFileIdsFromMessagesJson(r.messages_json)
  );

  await db.batch([
    db.prepare(`DELETE FROM shared_links WHERE user_id = ?`).bind(userId),
    db
      .prepare(`DELETE FROM dialogs WHERE user_id = ? AND is_hidden = 1`)
      .bind(userId),
  ]);

  await cleanupCandidateFileIds(userId, candidateIds, env);
  return { success: true };
}

export async function getSharedSnapshot(
  shareId: string,
  env?: any
): Promise<SharedDialogView | null> {
  if (!shareId) return null;
  const db = getDB(env);

  const row = await db
    .prepare(
      `SELECT s.share_id, s.created_at, d.title, d.model, d.messages_json
       FROM shared_links s
       JOIN dialogs d ON s.snapshot_dialog_id = d.id
       WHERE s.share_id = ?`
    )
    .bind(shareId)
    .first<{
      share_id: string;
      created_at: number;
      title: string;
      model: string;
      messages_json: string;
    }>();

  if (!row) return null;

  let messages: Message[] = [];
  try {
    messages = JSON.parse(row.messages_json);
  } catch {
    messages = [];
  }

  return {
    shareId: row.share_id,
    title: row.title,
    model: row.model,
    createdAt: row.created_at,
    messages,
  };
}
