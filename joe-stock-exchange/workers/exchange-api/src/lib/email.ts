import type { Env } from "../env";
import { HttpError } from "./http";
import { createId } from "./ids";

export type TransactionalEmailPurpose = "verification" | "password_reset";

interface TransactionalEmailInput {
  userId: string;
  purpose: TransactionalEmailPurpose;
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface ResendResponse {
  id?: string;
}

async function recordEmail(
  env: Env,
  input: TransactionalEmailInput,
  recordId: string,
  providerMessageId: string | null,
  status: "accepted" | "failed",
  detail: string | null,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO transactional_emails
        (id, user_id, provider_message_id, purpose, recipient_email, status, status_detail, last_event_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    ).bind(
      recordId,
      input.userId,
      providerMessageId,
      input.purpose,
      input.to,
      status,
      detail,
    ).run();
  } catch (error) {
    console.error("Transactional email record could not be stored", { recordId, userId: input.userId, error });
  }
}

export async function sendTransactionalEmail(env: Env, input: TransactionalEmailInput): Promise<string | null> {
  if (!env.RESEND_API_KEY) {
    if (env.ENVIRONMENT === "production") {
      throw new HttpError(503, "EMAIL_NOT_CONFIGURED", "Transactional email delivery is not configured.");
    }
    return null;
  }

  const recordId = createId("mail");
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
        "idempotency-key": recordId,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    await recordEmail(env, input, recordId, null, "failed", "Resend request unavailable");
    console.error("Transactional email request failed", { recordId, userId: input.userId, error });
    throw new HttpError(502, "EMAIL_DELIVERY_FAILED", "The email could not be submitted for delivery.");
  }

  let payload: ResendResponse = {};
  try {
    payload = await response.json() as ResendResponse;
  } catch {
    // A provider message ID improves observability but is not required to honor an accepted send.
  }

  if (!response.ok) {
    await recordEmail(env, input, recordId, payload.id ?? null, "failed", `Resend returned ${response.status}`);
    throw new HttpError(502, "EMAIL_DELIVERY_FAILED", "The email could not be submitted for delivery.");
  }

  await recordEmail(env, input, recordId, payload.id ?? null, "accepted", null);
  return payload.id ?? null;
}
