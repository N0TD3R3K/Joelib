# Verification incident and test-account recovery guide

Status: remediation deployed and smoke-tested on November 12, 2026. The
Resend webhook and `RESEND_WEBHOOK_SECRET` still need to be configured before
delivery, delay, and bounce states can update after provider acceptance. No
production account mutation is authorized by this document.

Implemented and deployed:

- canonical `unixepoch()` expiry comparisons for invitations, verification,
  recovery, and sessions;
- configurable 24-hour verification links with HTML and plain-text content;
- neutral Turnstile-protected member resend and administrator resend;
- invalidation of earlier unused verification links;
- provider message-ID storage and a signature-verified Resend webhook route;
- delivery status on the Members page;
- audited cancellation of activity-free pending registrations, with invitation
  restoration for registrations created after the new migration;
- preservation of the verification success message; and
- in-memory SQLite integration coverage for the authentication lifecycle.

## Incident snapshot — November 12, 2026

Production showed four member accounts in `pending_verification`. Resend showed
three messages accepted by the recipient mail servers and one message bounced.
None of the four verification tokens had been consumed, and none of the four
accounts had received an opening-balance ledger entry.

The live `/v1/auth/verify-email` route and browser CORS policy were reachable.
The incident is therefore a combination of delivery/recovery limitations and
authentication implementation defects, rather than a complete email-provider
outage.

## Original findings and deployed remediation

### Resolved P1 — Normalize every authentication expiry comparison

The API writes JavaScript ISO timestamps such as
`2026-11-12T14:41:11.624Z`, while SQLite `CURRENT_TIMESTAMP` produces values
such as `2026-11-12 16:11:23`. Comparing those values directly as text produces
incorrect results.

Affected paths:

- invitation expiration in `workers/exchange-api/src/routes/auth.ts`;
- email-verification expiration in `workers/exchange-api/src/routes/auth.ts`;
- password-reset expiration in `workers/exchange-api/src/routes/auth.ts`; and
- session expiration in `workers/exchange-api/src/lib/auth.ts`.

Use one canonical database representation. A short-term correction is to parse
stored values with SQLite `datetime()` or `unixepoch()` in every comparison.
The preferred long-term correction is to store integer Unix timestamps and
compare integers. Cover the exact boundary, expired, valid, and malformed cases
with integration tests.

### Resolved P1 — Add verification recovery

The original registration created one verification token with an intended
30-minute lifetime and had no resend-verification endpoint or button. The
deployed flow now uses a configurable 24-hour default and provides both member
and administrator resend controls.

Add a neutral, rate-limited `POST /v1/auth/resend-verification` flow that:

1. requires Turnstile;
2. returns the same public response whether the account exists or not;
3. invalidates every earlier unused verification token for the account;
4. creates and sends one new token;
5. records the attempt without logging the plaintext token; and
6. enforces per-account and per-network cooldowns.

Make the verification lifetime configurable and long enough for school email
quarantine/review. State the expiration in both the HTML and plain-text email.

### Partially resolved P1 — Track delivery and bounce events

The deployed API stores Resend's returned email ID and exposes a
signature-verified webhook route. Provider acceptance is recorded now. The
Resend dashboard webhook and Worker webhook secret remain an owner setup step;
until completed, later delivery, bounce, and suppression events are not
received.

Store a transactional-email record containing the provider message ID, user
ID, purpose, recipient, accepted time, and latest delivery state. Add a
signature-verified Resend webhook for delivered, delayed, bounced, suppressed,
and complained events. Surface the state in the Operations Console. Never store
the plaintext verification token.

For bounced pending accounts, provide an audited administrator action to cancel
the pending registration. An email correction must require appropriate proof
and must issue a fresh token.

### Resolved P2 — Preserve the verification result message

`apps/exchange-web/src/App.tsx` sets “School email verified” and immediately
refreshes the signed-in portfolio. Verification does not create a session, so
the expected unauthenticated portfolio response can overwrite the success
message with an authentication error.

Keep verification state separate from session-loading errors, return the user
to a dedicated success screen, and invite them to sign in.

### Resolved P1 — Add authentication integration tests

The current automated tests cover market rules but not authentication. Add
tests for registration, provider acceptance failure, verification, duplicate
verification, expiration, resend invalidation, bounce events, opening-balance
idempotency, password-reset expiration, invitation expiration, and session
expiration.

## Current account-management capability

The Operations Console's **Members** page lists accounts, account status, and
the latest tracked verification-email status. Administrators can resend a
verification email or cancel an activity-free pending registration. Financial
classification (`normal` or `bankrupt`) remains available. There is no
supported console or API operation to:

- suspend or reactivate an account;
- change a pending email address; or
- delete an active account.

Hard deletion is not a safe general account-management operation. Active users
can be referenced by orders, trades, transfers, share offers, holdings, loans,
news, comments, ledger entries, invitations, state-transition locks, and audit
records. Several relationships intentionally do not cascade, so deleting an
active user may fail or damage the permanent record.

Registrations created after migration `0006_registration_recovery.sql` retain
their invitation relationship, so cancelling one safely restores its use.
Older pending accounts have no stored invitation relationship; cancelling one
does not guess or decrement an invitation, and a new invitation must be issued
for a retry.

## Safe approach for another beta test round

Do not reuse the production database as a disposable test fixture. Create a
separate preview/test D1 database and separate Worker environment for destructive
round resets.

For production-like beta accounts:

1. Back up or export D1 before any cleanup.
2. Limit cancellation to unverified accounts with no financial, trade, loan,
   comment, or audit activity.
3. Perform cancellation through the deployed administrator-only API operation,
   which is audited and limited to activity-free pending accounts.
4. Reconcile or deliberately replace the invitation instead of silently
   decrementing an unrelated shared counter.
5. Invalidate verification tokens, password-reset tokens, and sessions.
6. Preserve active-account financial and audit history; suspend or close those
   accounts rather than hard-deleting them.
7. Issue new invitations for the next round.

Never run a broad `DELETE FROM users` statement. Use the console action for
eligible pending registrations and explicitly review any other maintenance
operation against exact account IDs.

## Remaining follow-up order

1. Create the Resend webhook for `https://api.joese.derekli.dev/v1/webhooks/resend`
   and install its signing secret as `RESEND_WEBHOOK_SECRET`.
2. Add suspend/reactivate/close operations for active accounts.
3. Provision a separate test environment with a repeatable reset script.

