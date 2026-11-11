# JOESE security and abuse prevention

## Trust boundaries

- Member and console browsers are untrusted clients.
- Every write is authenticated and authorized by the API Worker.
- Operator and administrator roles are checked server-side for every console
  endpoint; hiding a button is never an authorization control.
- The market-engine manual run endpoint requires a shared internal secret and
  is not exposed in either browser bundle.

## Account controls

- Registration accepts only configured school domains and one active account
  per verified school email.
- Invitations, password checks, email verification, one-use password recovery,
  secure HttpOnly sessions, neutral authentication errors, and server-side
  Turnstile validation protect account access.
- Suspected duplicate-person accounts require a documented administrator review.
- Role or account-status changes invalidate or re-evaluate active sessions.

## Market and transfer controls

- Operators and administrators cannot trade or transfer J$.
- The API reserves a sender's J$ while a transaction awaits receiver approval.
- A buyer cannot create a request for frozen shareholding assets; only a seller
  can name a buyer and create an offer.
- Market ticks are unique by time key, so a retry cannot apply the same tick
  twice.
- A console editor can modify company copy but not directly write a price.

## Required deployment hardening before public launch

- Configure the production Turnstile site key and secret, then verify both
  member and operator login challenges from the final custom domains.
- Configure Cloudflare rate limits for authentication, invitations, comments,
  transfers, share offers, and console writes.
- Keep the API's exact-origin write check, credentialed CORS allowlist, and
  SameSite session cookie aligned with the final custom domains.
- Review Content Security Policy, custom-domain TLS, dependency alerts, log
  redaction, D1 backups, and incident-response ownership.
- Run account-isolation, duplicate-submit, balance-race, privilege-escalation,
  CORS, and market-tick replay tests in staging.

