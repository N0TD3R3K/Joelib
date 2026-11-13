import type { Env } from "../env";
import { HttpError, json } from "../lib/http";
import { createId } from "../lib/ids";

type DeliveryStatus = "accepted" | "delayed" | "delivered" | "bounced" | "suppressed" | "complained" | "failed";

interface ResendWebhookEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    to?: string[];
    bounce?: { message?: string };
    error?: { message?: string } | string;
  };
}

const encoder = new TextEncoder();

function base64Bytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyResendWebhookSignature(
  payload: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  webhookSecret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const timestamp = Number(headers.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) return false;

  let secret: Uint8Array;
  try {
    secret = base64Bytes(webhookSecret.replace(/^whsec_/, ""));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${headers.id}.${headers.timestamp}.${payload}`),
  ));

  return headers.signature.split(" ").some((entry) => {
    const [version, encoded] = entry.split(",", 2);
    if (version !== "v1" || !encoded) return false;
    try { return sameBytes(expected, base64Bytes(encoded)); } catch { return false; }
  });
}

function deliveryStatus(type: string | undefined): DeliveryStatus | null {
  switch (type) {
    case "email.sent": return "accepted";
    case "email.delivery_delayed": return "delayed";
    case "email.delivered": return "delivered";
    case "email.bounced": return "bounced";
    case "email.suppressed": return "suppressed";
    case "email.complained": return "complained";
    case "email.failed": return "failed";
    default: return null;
  }
}

function statusDetail(event: ResendWebhookEvent): string | null {
  if (event.data?.bounce?.message) return event.data.bounce.message.slice(0, 1_000);
  if (typeof event.data?.error === "string") return event.data.error.slice(0, 1_000);
  if (event.data?.error?.message) return event.data.error.message.slice(0, 1_000);
  return null;
}

export async function handleWebhooks(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (url.pathname !== "/v1/webhooks/resend" || request.method !== "POST") return null;
  if (!env.RESEND_WEBHOOK_SECRET) {
    throw new HttpError(503, "WEBHOOK_NOT_CONFIGURED", "Email delivery tracking is not configured.");
  }

  const payload = await request.text();
  const valid = await verifyResendWebhookSignature(payload, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, env.RESEND_WEBHOOK_SECRET);
  if (!valid) throw new HttpError(401, "INVALID_WEBHOOK_SIGNATURE", "The webhook signature is invalid.");

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload) as ResendWebhookEvent;
  } catch {
    throw new HttpError(400, "INVALID_WEBHOOK", "The webhook body is not valid JSON.");
  }

  const status = deliveryStatus(event.type);
  const providerMessageId = event.data?.email_id;
  if (!status || !providerMessageId) return json({ accepted: true, tracked: false });

  const eventAt = event.created_at ?? new Date().toISOString();
  const recipient = event.data?.to?.[0] ?? "unknown@invalid";
  await env.DB.prepare(
    `INSERT INTO transactional_emails
      (id, provider_message_id, internet_message_id, purpose, recipient_email,
       status, status_detail, last_event_at)
     VALUES (?, ?, ?, 'unknown', ?, ?, ?, ?)
     ON CONFLICT(provider_message_id) DO UPDATE SET
       internet_message_id = COALESCE(excluded.internet_message_id, transactional_emails.internet_message_id),
       status = CASE
         WHEN transactional_emails.last_event_at IS NULL
           OR unixepoch(excluded.last_event_at) >= unixepoch(transactional_emails.last_event_at)
         THEN excluded.status ELSE transactional_emails.status END,
       status_detail = CASE
         WHEN transactional_emails.last_event_at IS NULL
           OR unixepoch(excluded.last_event_at) >= unixepoch(transactional_emails.last_event_at)
         THEN excluded.status_detail ELSE transactional_emails.status_detail END,
       last_event_at = CASE
         WHEN transactional_emails.last_event_at IS NULL
           OR unixepoch(excluded.last_event_at) >= unixepoch(transactional_emails.last_event_at)
         THEN excluded.last_event_at ELSE transactional_emails.last_event_at END,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    createId("mail_event"),
    providerMessageId,
    event.data?.message_id ?? null,
    recipient,
    status,
    statusDetail(event),
    eventAt,
  ).run();
  return json({ accepted: true, tracked: true });
}
