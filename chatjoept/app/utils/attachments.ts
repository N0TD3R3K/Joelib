import type { Attachment, UserQuotas } from "~/types/chat";

export const MAX_UPLOAD_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MiB (Workers memory ceiling)
export const MAX_PLAIN_TEXT_BYTES = 1 * 1024 * 1024; // 1 MiB (inline text)

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "ppt", "pptx"]);
const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const SPREADSHEET_EBOOK_EXTENSIONS = new Set(["xlsx", "xls", "epub", "mobi"]);
const SPREADSHEET_EBOOK_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/epub+zip",
  "application/x-mobipocket-ebook",
]);

const BLOCKED_BINARY_MIME_PREFIXES = ["audio/", "video/", "font/", "image/"];

export type FileRouteCategory =
  | "vision_image"
  | "rich_layout_document"
  | "user_data_file"
  | "check_plain_text";

export function classifyFileRoute(filename: string, mimeType: string): FileRouteCategory {
  const ext = filename.includes(".")
    ? filename.split(".").pop()!.toLowerCase()
    : "";
  const mime = (mimeType || "").toLowerCase();

  // SVG is XML plain text, not a raster image for Vision
  if (ext === "svg" || mime === "image/svg+xml") {
    return "check_plain_text";
  }

  if (IMAGE_EXTENSIONS.has(ext) || IMAGE_MIMES.has(mime)) {
    return "vision_image";
  }

  if (DOCUMENT_EXTENSIONS.has(ext) || DOCUMENT_MIMES.has(mime)) {
    return "rich_layout_document";
  }

  if (SPREADSHEET_EBOOK_EXTENSIONS.has(ext) || SPREADSHEET_EBOOK_MIMES.has(mime)) {
    return "user_data_file";
  }

  return "check_plain_text";
}

export function decodeUtf8PlainTextIfValid(bytes: Uint8Array): string | null {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      return null; // NUL byte indicates binary payload
    }
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null; // Invalid UTF-8 sequence
  }

  for (let i = 0; i < decoded.length; i++) {
    const code = decoded.charCodeAt(i);
    // Reject unexpected C0 control chars (allow \t=9, \n=10, \f=12, \r=13)
    if (code < 32 && code !== 9 && code !== 10 && code !== 12 && code !== 13) {
      return null;
    }
  }

  return decoded;
}

export type PrepareAttachmentResult =
  | { ok: true; attachment: Attachment; previewUrl?: string; quotas?: UserQuotas }
  | { ok: false; error: string };

export async function classifyAndPrepareAttachment(
  file: File
): Promise<PrepareAttachmentResult> {
  const category = classifyFileRoute(file.name, file.type);

  // 1. Vision images, Documents (rich_layout_recognition), Spreadsheets & Ebooks (user_data) -> Object Storage (/api/files)
  if (
    category === "vision_image" ||
    category === "rich_layout_document" ||
    category === "user_data_file"
  ) {
    if (file.size === 0) {
      return { ok: false, error: `"${file.name}" is empty.` };
    }
    if (file.size > MAX_UPLOAD_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `"${file.name}" exceeds the 25 MiB upload limit.`,
      };
    }

    const formData = new FormData();
    formData.append("file", file, file.name);

    const res = await fetch("/api/files", {
      method: "POST",
      body: formData,
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.fileId) {
      return {
        ok: false,
        error: data?.error || `Failed to upload "${file.name}".`,
      };
    }

    const isImage = category === "vision_image";
    return {
      ok: true,
      attachment: {
        name: data.filename || file.name,
        size: data.bytes || file.size,
        type: file.type || (isImage ? "image/png" : "application/octet-stream"),
        kind: isImage ? "image" : "file",
        content: "",
        fileId: data.fileId,
        parsingPurpose:
          data.purpose ||
          (category === "rich_layout_document" ? "rich_layout_recognition" : "user_data"),
      },
      previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      quotas: data.quotas,
    };
  }

  // 2. Plain-text check -> attach inline text OR reject unsupported binary format
  const lowerMime = (file.type || "").toLowerCase();
  if (BLOCKED_BINARY_MIME_PREFIXES.some((prefix) => lowerMime.startsWith(prefix))) {
    return {
      ok: false,
      error: `"${file.name}" is not supported as an attachment. Supported types: images (PNG, JPEG, GIF, WebP), documents (PDF, DOC, DOCX, PPT, PPTX), spreadsheets/ebooks (XLSX, XLS, EPUB, MOBI), and plain text files.`,
    };
  }

  if (file.size > MAX_PLAIN_TEXT_BYTES) {
    return {
      ok: false,
      error: `"${file.name}" exceeds the 1 MiB plain-text attachment limit.`,
    };
  }

  const buffer = await file.arrayBuffer();
  const decoded = decodeUtf8PlainTextIfValid(new Uint8Array(buffer));
  if (decoded === null) {
    return {
      ok: false,
      error: `"${file.name}" is not supported as an attachment. Supported types: images (PNG, JPEG, GIF, WebP), documents (PDF, DOC, DOCX, PPT, PPTX), spreadsheets/ebooks (XLSX, XLS, EPUB, MOBI), and plain text files.`,
    };
  }

  return {
    ok: true,
    attachment: {
      name: file.name,
      size: file.size,
      type: file.type || "text/plain",
      kind: "text",
      content: decoded,
    },
  };
}
