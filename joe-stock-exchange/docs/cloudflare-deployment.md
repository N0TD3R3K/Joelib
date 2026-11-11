# Cloudflare deployment

## Deployed services

| Service | Cloudflare product | Intended address |
| --- | --- | --- |
| Member exchange | Worker static assets | `joese.derekli.dev` |
| Operations console | Worker static assets | `console.joese.derekli.dev` |
| Exchange API | Worker + D1 | `api.joese.derekli.dev` |
| Market engine | Worker Cron Trigger + D1 | private Worker |

The Cron Trigger runs every UTC hour. The engine checks `America/New_York` at
runtime and produces ticks only from 2:00 PM through 10:00 PM local time. This
avoids a fixed UTC schedule drifting when daylight-saving time changes.

## First deployment

1. Authenticate Wrangler with the intended Cloudflare account.
2. Create the database:

   ```sh
   npx wrangler d1 create joese
   ```

3. Put the returned `database_id` in both Worker Wrangler files.
4. Create production secrets without committing their values:

   ```sh
   npx wrangler secret put SESSION_SECRET --config workers/exchange-api/wrangler.jsonc
   npx wrangler secret put RESEND_API_KEY --config workers/exchange-api/wrangler.jsonc
   npx wrangler secret put TURNSTILE_SECRET_KEY --config workers/exchange-api/wrangler.jsonc
   npx wrangler secret put INTERNAL_API_KEY --config workers/exchange-api/wrangler.jsonc
   npx wrangler secret put INTERNAL_API_KEY --config workers/market-engine/wrangler.jsonc
   ```

5. Create a Turnstile widget for both web hostnames. Copy each app's
   `.env.production.example` to `.env.production`, set its public site key, and
   keep demo mode disabled. The deploy scripts refuse to continue if these
   values are incomplete. Review
   `ALLOWED_EMAIL_DOMAINS`, `ALLOWED_ORIGINS`, and `RESEND_FROM_EMAIL` in the
   API Wrangler file.
6. Apply migrations and seed only the reference data:

   ```sh
   npm run db:migrate:remote
   npx wrangler d1 execute joese --remote \
     --config workers/exchange-api/wrangler.jsonc \
     --file database/seed/0001_reference_data.sql
   ```

7. Create the first administrator exactly once through the internal bootstrap
   endpoint, using the `INTERNAL_API_KEY` header. The endpoint closes as soon as
   an administrator exists. Then sign in and create invitations through the
   administrator-only console API. Never commit or log the bootstrap password,
   plaintext invitation, or internal key.
8. Build with production app variables and run the full check:

   ```sh
   VITE_API_BASE_URL=https://api.joese.derekli.dev/v1 \
   VITE_TURNSTILE_SITE_KEY=replace-with-the-public-site-key \
   VITE_DEMO_MODE=false npm run check
   ```

9. Deploy in dependency order:

   ```sh
   npm run deploy:api
   npm run deploy:engine
   npm run deploy:exchange
   npm run deploy:console
   ```

10. Attach or confirm the three custom domains in Cloudflare and verify
    `/v1/health`, login, a console edit, and a scheduled tick in a staging
    environment before opening the production exchange.

## Runtime variables

| Name | Service | Secret | Purpose |
| --- | --- | --- | --- |
| `ALLOWED_EMAIL_DOMAINS` | API | No | Comma-separated eligible school domains. |
| `ALLOWED_ORIGINS` | API | No | Exact member and console origins allowed by CORS. |
| `REQUIRE_INVITE` | API | No | Require a valid invitation during registration. |
| `RESEND_FROM_EMAIL` | API | No | Verified transactional sender. |
| `SESSION_SECRET` | API | Yes | Additional entropy for session-token hashing. |
| `RESEND_API_KEY` | API | Yes | Verification email delivery. |
| `TURNSTILE_SECRET_KEY` | API | Yes | Server-side registration and login challenge validation. |
| `INTERNAL_API_KEY` | API and engine | Yes | Protects internal tick and health coordination. |

## Pre-launch checks

- Replace every placeholder D1 ID.
- Confirm production builds do not enable demo mode.
- Confirm the Turnstile widget renders and Siteverify accepts each token only once.
- Confirm operator accounts cannot trade.
- Confirm all console writes require an operator or administrator session.
- Confirm allowed CORS origins are exact HTTPS origins.
- Confirm invitation plaintext and API secrets are absent from source and D1
  query logs.
- Confirm a transfer remains pending until the receiver accepts it.
- Confirm only a seller can initiate a frozen-share offer.
- Confirm the market engine is idempotent for the same hourly tick.
- Confirm backups, retention, incident response, and account-recovery ownership.
- Do not open public membership until the reviewed password-recovery flow is enabled.

