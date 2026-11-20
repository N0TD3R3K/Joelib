import type { ActionFunctionArgs } from "react-router";
import { getAuthenticatedUser, getEnv } from "~/utils/auth.server";
import {
  MAX_UPLOADED_STORAGE_BYTES,
  calculateFileParsingCostUsd,
  checkUserUsageAllowed,
  deleteUploadedUserFile,
  ensureUserExists,
  estimateDocumentPageCount,
  findExistingUploadedFileByHash,
  getUserQuotas,
  getUserUploadedFilesBytes,
  recordUserUsage,
  registerUploadedUserFile,
} from "~/utils/db.server";

export const MAX_SINGLE_FILE_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MiB (Worker memory ceiling)

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const RICH_LAYOUT_EXTENSIONS = new Set(["pdf", "doc", "docx", "ppt", "pptx"]);
const RICH_LAYOUT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const USER_DATA_EXTENSIONS = new Set(["xlsx", "xls", "epub", "mobi"]);
const USER_DATA_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/epub+zip",
  "application/x-mobipocket-ebook",
]);

function resolveUploadSpec(
  filename: string,
  mimeType: string
): { kind: "image" | "file"; purpose: "rich_layout_recognition" | "user_data" } | null {
  const ext = filename.includes(".")
    ? filename.split(".").pop()!.toLowerCase()
    : "";
  const mime = (mimeType || "").toLowerCase();

  // SVG is plain-text XML, not a raster image for Vision
  if (ext === "svg" || mime === "image/svg+xml") {
    return null;
  }
  if (IMAGE_EXTENSIONS.has(ext) || IMAGE_MIMES.has(mime)) {
    return { kind: "image", purpose: "user_data" };
  }
  if (RICH_LAYOUT_EXTENSIONS.has(ext) || RICH_LAYOUT_MIMES.has(mime)) {
    return { kind: "file", purpose: "rich_layout_recognition" };
  }
  if (USER_DATA_EXTENSIONS.has(ext) || USER_DATA_MIMES.has(mime)) {
    return { kind: "file", purpose: "user_data" };
  }
  return null;
}

async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

// POST /api/files -> upload image/document/spreadsheet/ebook to DeepSeek Files API (deduped + ref-counted)
// DELETE /api/files?id=... -> remove unreferenced file from DeepSeek & free quota
export async function action({ request }: ActionFunctionArgs) {
  const env = getEnv();
  const session = await getAuthenticatedUser(request, env);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserExists(session, env);

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const fileId = (url.searchParams.get("id") || "").trim();
    if (!fileId) {
      return Response.json({ error: "Missing file id" }, { status: 400 });
    }
    const result = await deleteUploadedUserFile(session.sub, fileId, env);
    const quotas = await getUserQuotas(session.sub, env);
    return Response.json({ success: result.success, quotas });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { allowed, exceededWindow } = await checkUserUsageAllowed(session.sub, env);
  if (!allowed) {
    const label =
      exceededWindow === "5h" ? "5-hour usage limit ($0.25)" : "7-day usage limit ($2.00)";
    return Response.json(
      {
        error: `${label} reached. File uploads and parsing are unavailable until sliding quota refreshes.`,
      },
      { status: 429 }
    );
  }

  const apiKey = (env.LLM_API_KEY || "").trim();
  if (!apiKey) {
    return Response.json(
      { error: "File uploads and Vision require LLM_API_KEY to be configured on the server." },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    return Response.json({ error: "Missing file field" }, { status: 400 });
  }

  const file = fileEntry as File;
  const spec = resolveUploadSpec(file.name, file.type);
  if (!spec) {
    return Response.json(
      {
        error: `Unsupported file format for "${file.name}". Supported upload formats: PNG, JPEG, GIF, WebP, PDF, DOC, DOCX, PPT, PPTX, XLSX, XLS, EPUB, MOBI.`,
      },
      { status: 400 }
    );
  }

  if (file.size <= 0) {
    return Response.json({ error: `"${file.name}" is empty.` }, { status: 400 });
  }

  if (file.size > MAX_SINGLE_FILE_UPLOAD_BYTES) {
    return Response.json(
      {
        error: `"${file.name}" (${formatMiB(file.size)}) exceeds the 25 MiB single-file upload limit.`,
      },
      { status: 413 }
    );
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const contentHash = await computeSha256Hex(fileBytes);

  // Deduplicate identical files already cached for this user: reuse existing file_id without consuming extra quota
  const existing = await findExistingUploadedFileByHash(
    session.sub,
    spec.purpose,
    contentHash,
    env
  );
  if (existing) {
    const quotas = await getUserQuotas(session.sub, env);
    return Response.json({
      fileId: existing.id,
      filename: file.name,
      bytes: existing.sizeBytes,
      purpose: spec.purpose,
      kind: spec.kind,
      deduplicated: true,
      pages: 0,
      quotas,
    });
  }

  const currentUploadedBytes = await getUserUploadedFilesBytes(session.sub, env);
  if (currentUploadedBytes + file.size > MAX_UPLOADED_STORAGE_BYTES) {
    const remaining = Math.max(0, MAX_UPLOADED_STORAGE_BYTES - currentUploadedBytes);
    return Response.json(
      {
        error: `Account uploaded storage limit reached (128 MiB max, ${formatMiB(remaining)} remaining). Delete old chats or shared links in Settings to free space.`,
      },
      { status: 413 }
    );
  }

  const rawBaseUrl = (env.LLM_API_URL || "https://api.deepseek.com").trim();
  const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

  // DeepSeek Files API requires `purpose` before `file` in multipart/form-data
  const upstreamForm = new FormData();
  upstreamForm.append("purpose", spec.purpose);
  upstreamForm.append(
    "file",
    new Blob([fileBytes], { type: file.type || "application/octet-stream" }),
    file.name
  );

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${baseUrl}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: upstreamForm,
    });
  } catch (err: any) {
    return Response.json(
      { error: `Failed to reach file upload service: ${err?.message || "network error"}` },
      { status: 502 }
    );
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "Upload failed");
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      detail = parsed.error?.message || parsed.message || errText;
    } catch {
      // keep raw
    }
    const cleanDetail = String(detail)
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/deepseek/gi, "ChatJoePT")
      .trim();
    return Response.json(
      { error: `File upload failed (${upstreamRes.status}): ${cleanDetail}` },
      { status: upstreamRes.status >= 400 && upstreamRes.status < 500 ? upstreamRes.status : 502 }
    );
  }

  const data: any = await upstreamRes.json();
  const fileId = String(data?.id || "").trim();
  if (!fileId) {
    return Response.json(
      { error: "File upload succeeded without returning a file id." },
      { status: 502 }
    );
  }

  const storedBytes = Number(data?.bytes || file.size) || file.size;

  await registerUploadedUserFile(
    session.sub,
    {
      id: fileId,
      filename: data?.filename || file.name,
      purpose: spec.purpose,
      sizeBytes: storedBytes,
      contentHash,
    },
    env
  );

  let pages = 0;
  if (spec.purpose === "rich_layout_recognition") {
    const upstreamPages = Number(data?.page_count ?? data?.pages);
    pages =
      Number.isFinite(upstreamPages) && upstreamPages > 0
        ? Math.ceil(upstreamPages)
        : estimateDocumentPageCount(fileBytes, file.name, file.type);
    const parsingCostUsd = calculateFileParsingCostUsd(pages);
    await recordUserUsage(session.sub, parsingCostUsd, 0, env);
  }

  const quotas = await getUserQuotas(session.sub, env);

  return Response.json({
    fileId,
    filename: data?.filename || file.name,
    bytes: storedBytes,
    purpose: spec.purpose,
    kind: spec.kind,
    deduplicated: false,
    pages,
    quotas,
  });
}
