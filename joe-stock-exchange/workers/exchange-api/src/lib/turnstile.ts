import type { Env } from "../env";
import { HttpError } from "./http";

interface TurnstileResult {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
}

export async function verifyTurnstile(
  request: Request,
  env: Env,
  token: string | undefined,
  expectedAction: "login" | "register" | "recovery",
): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY && env.ENVIRONMENT !== "production") return;
  if (!env.TURNSTILE_SECRET_KEY) {
    throw new HttpError(503, "TURNSTILE_NOT_CONFIGURED", "Account protection is not configured.");
  }
  if (!token) {
    throw new HttpError(400, "TURNSTILE_REQUIRED", "Complete the account protection check and try again.");
  }

  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  form.set("idempotency_key", crypto.randomUUID());
  const remoteIp = request.headers.get("cf-connecting-ip");
  if (remoteIp) form.set("remoteip", remoteIp);

  let result: TurnstileResult;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Siteverify returned ${response.status}`);
    result = await response.json() as TurnstileResult;
  } catch (error) {
    console.error("Turnstile validation unavailable", { error });
    throw new HttpError(503, "TURNSTILE_UNAVAILABLE", "Account protection is temporarily unavailable. Try again shortly.");
  }

  const allowedHosts = env.ALLOWED_ORIGINS.split(",")
    .map((origin) => {
      try { return new URL(origin.trim()).hostname; } catch { return ""; }
    })
    .filter(Boolean);
  const actionValid = !result.action || result.action === expectedAction;
  const hostnameValid = !result.hostname || allowedHosts.includes(result.hostname);
  if (!result.success || !actionValid || !hostnameValid) {
    throw new HttpError(400, "TURNSTILE_FAILED", "The account protection check expired or could not be verified.");
  }
}
