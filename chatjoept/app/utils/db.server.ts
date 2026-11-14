// Cloudflare D1 Database Server Utilities for ChatJoePT
// Manages:
// 1. User profiles synced from JoeAuth (sub, email, name, picture)
// 2. Rolling 24-hour API usage tracking & limit (2.00 CNY cap)
// 3. Visible dialogs & hidden shared snapshot dialogs with exact Storage Credit accounting
//    - Pool: 16,384 credits (Soft limit: 16,000, Hard limit: 16,384)
//    - Normal chat credit: 256 + ceil(bytes / 1024)
//    - Shared snapshot credit: 32 + ceil(bytes / 1024)

import type { ChatSession, Message, SharedLinkSummary, UserQuotas } from "~/types/chat";

export const STORAGE_CREDIT_SOFT_LIMIT = 16000;
export const STORAGE_CREDIT_HARD_LIMIT = 16384;
export const CHAT_BASE_CREDIT = 256;
export const SHARE_BASE_CREDIT = 32;

export const USAGE_LIMIT_CNY_24H = 2.0; // 2.00 CNY per rolling 24h

// DeepSeek Pricing (CNY per 1M tokens)
export const DEEPSEEK_CACHE_MISS_PRICE_PER_M = 2.0;
export const DEEPSEEK_CACHE_HIT_PRICE_PER_M = 0.5;
export const DEEPSEEK_OUTPUT_PRICE_PER_M = 8.0;

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
// 2. 24-Hour Usage Tracking & Cost Cap
// -------------------------------------------------------------

export function calculateCostCny(usage: {
  promptTokens?: number;
  completionTokens?: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
}): number {
  const hitTokens = usage.promptCacheHitTokens || 0;
  const missTokens =
    usage.promptCacheMissTokens !== undefined
      ? usage.promptCacheMissTokens
      : (usage.promptTokens || 0) - hitTokens;
  const outTokens = usage.completionTokens || 0;

  const inputCost =
    (Math.max(0, missTokens) * DEEPSEEK_CACHE_MISS_PRICE_PER_M +
      hitTokens * DEEPSEEK_CACHE_HIT_PRICE_PER_M) /
    1_000_000;
  const outputCost = (outTokens * DEEPSEEK_OUTPUT_PRICE_PER_M) / 1_000_000;

  return inputCost + outputCost;
}

export async function getUser24hUsage(
  userId: string,
  env?: any
): Promise<{ currentCostCny: number; usagePercent: number }> {
  if (!userId) return { currentCostCny: 0, usagePercent: 0 };
  const db = getDB(env);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  // Prune expired records (> 48h) opportunistically and sum last 24h
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(cost_cny), 0) AS total_cost
       FROM usage_records
       WHERE user_id = ? AND created_at >= ?`
    )
    .bind(userId, cutoff)
    .first<{ total_cost: number }>();

  const currentCostCny = Number(row?.total_cost || 0);
  const usagePercent = Math.min(
    100,
    Math.round((currentCostCny / USAGE_LIMIT_CNY_24H) * 100)
  );

  return { currentCostCny, usagePercent };
}

export async function checkUser24hAllowed(
  userId: string,
  env?: any
): Promise<{ allowed: boolean; usagePercent: number }> {
  const { currentCostCny, usagePercent } = await getUser24hUsage(userId, env);
  return {
    allowed: currentCostCny < USAGE_LIMIT_CNY_24H,
    usagePercent,
  };
}

export async function recordUserUsage(
  userId: string,
  costCny: number,
  tokens: number,
  env?: any
): Promise<void> {
  if (!userId || costCny <= 0) return;
  const db = getDB(env);
  const now = Date.now();
  const id = `use_${crypto.randomUUID().replace(/-/g, "")}`;
  const pruneBefore = now - 48 * 60 * 60 * 1000;

  await db.batch([
    db
      .prepare(
        `INSERT INTO usage_records (id, user_id, cost_cny, tokens, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, userId, costCny, tokens, now),
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
      usagePercent: 0,
      chatPercent: 0,
      sharePercent: 0,
      freePercent: 100,
      isSoftLimited: false,
      isHardLimited: false,
    };
  }

  const [usage, credits] = await Promise.all([
    getUser24hUsage(userId, env),
    getUserCreditBreakdown(userId, env),
  ]);

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
    usagePercent: usage.usagePercent,
    chatPercent,
    sharePercent,
    freePercent,
    isSoftLimited: credits.totalCredits >= STORAGE_CREDIT_SOFT_LIMIT,
    isHardLimited: credits.totalCredits >= STORAGE_CREDIT_HARD_LIMIT,
  };
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
  await db
    .prepare(`DELETE FROM dialogs WHERE id = ? AND user_id = ? AND is_hidden = 0`)
    .bind(dialogId, userId)
    .run();
  return { success: true };
}

export async function deleteAllVisibleChats(
  userId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };
  const db = getDB(env);
  await db
    .prepare(`DELETE FROM dialogs WHERE user_id = ? AND is_hidden = 0`)
    .bind(userId)
    .run();
  return { success: true };
}

export async function deleteAllUserData(
  userId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };
  const db = getDB(env);
  await db.batch([
    db.prepare(`DELETE FROM shared_links WHERE user_id = ?`).bind(userId),
    db.prepare(`DELETE FROM dialogs WHERE user_id = ?`).bind(userId),
  ]);
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
      `SELECT snapshot_dialog_id FROM shared_links WHERE share_id = ? AND user_id = ?`
    )
    .bind(shareId, userId)
    .first<{ snapshot_dialog_id: string }>();

  if (!row) return { success: false };

  await db.batch([
    db
      .prepare(`DELETE FROM shared_links WHERE share_id = ? AND user_id = ?`)
      .bind(shareId, userId),
    db
      .prepare(`DELETE FROM dialogs WHERE id = ? AND user_id = ? AND is_hidden = 1`)
      .bind(row.snapshot_dialog_id, userId),
  ]);

  return { success: true };
}

export async function deleteAllUserSharedLinks(
  userId: string,
  env?: any
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };
  const db = getDB(env);

  await db.batch([
    db.prepare(`DELETE FROM shared_links WHERE user_id = ?`).bind(userId),
    db
      .prepare(`DELETE FROM dialogs WHERE user_id = ? AND is_hidden = 1`)
      .bind(userId),
  ]);

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
