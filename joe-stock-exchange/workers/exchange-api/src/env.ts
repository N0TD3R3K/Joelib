export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ALLOWED_EMAIL_DOMAINS: string;
  ALLOWED_ORIGINS: string;
  REQUIRE_INVITE: string;
  ENFORCE_TRADING_SCHEDULE: string;
  RESEND_FROM_EMAIL: string;
  SESSION_SECRET: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  INTERNAL_API_KEY: string;
}

