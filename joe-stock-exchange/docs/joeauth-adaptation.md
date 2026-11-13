# Adapting JOESE to JoeAuth

## 1. Scope and reviewed source

This document describes how JOE Stock Exchange (JOESE) should replace its
product-local login system with the Joe Team's open-source JoeAuth identity
provider while preserving JOESE membership, roles, financial history, and
authorization.

The design was reviewed against
[Histar4522/JoeAuth](https://github.com/Histar4522/JoeAuth) at commit
`e9d5fa8d8be7b83d4333c2fd1b4f53af1d741932` from November 12, 2026. JoeAuth is
still evolving; discovery metadata, routes, claims, security behavior, and
deployment configuration must be checked again against the deployed version
before implementation.

This is an adaptation plan, not authorization to change either project's
scripts, authentication code, database, DNS, or production configuration.

## 2. JoeAuth behavior JOESE can use

The reviewed JoeAuth implementation is an OpenID Connect/OAuth 2.0 provider on
Cloudflare Workers. It provides:

| Capability | Reviewed JoeAuth behavior |
| --- | --- |
| Discovery | `GET /.well-known/openid-configuration` |
| Signing keys | `GET /.well-known/jwks.json`; Ed25519/EdDSA JWKS |
| Authorization | `GET/POST /oauth/authorize`; authorization code only |
| Token exchange | `POST /api/oauth/token` |
| Live identity | `GET /api/oauth/userinfo` |
| Live token/account check | `POST /api/oauth/introspect` with client credentials |
| Refresh-token revocation | `POST /api/oauth/revoke` |
| User scopes | `openid`, `profile`, `email`, `offline_access` |
| Authorization code | Single-use, 60-second lifetime |
| User access token | EdDSA JWT, 15-minute lifetime |
| ID token | EdDSA JWT, 1-hour lifetime when `openid` is granted |
| Refresh token | Opaque rotating token, 30-day lifetime with family reuse detection |
| App token | EdDSA JWT, 1-hour lifetime from `client_credentials` |

The stable JoeAuth person identifier is the `sub` claim. `profile` supplies
`name`, `picture`, global `role`, and `developer_status`. `email` supplies
`email` and `email_verified`.

JoeAuth owns sign-in, password recovery, email verification, optional TOTP,
account chooser, consent, and global account status. JOESE must not copy or
verify JoeAuth passwords.

## 3. Register separate JoeAuth applications

An approved JoeAuth developer account creates applications and receives a
`client_id` plus a one-time `client_secret`. JoeAuth requires exact registered
redirect URI matches and limits requested scopes to the application's
`allowed_scopes`.

JOESE should register separate confidential clients:

1. **JOESE Member Exchange** — member sign-in callback; allowed scopes
   `openid profile email offline_access`.
2. **JOESE Operations Console** — separate callback and secret; same identity
   scopes, with all console authorization still enforced by JOESE.
3. **JOESE service identity** — optional `client_credentials` client for the
   market engine or future Joe Banking connection. It must not be reused by a
   browser.

Separate clients limit secret exposure, callback scope, consent, and incident
impact. A JoeAuth administrator may mark the two interactive products as
first-party only after reviewing their ownership and redirect URIs. First-party
status may skip consent; it does not remove PKCE or token validation.

Store each client secret only as a Worker secret. Never put it in Vite variables,
browser bundles, source, logs, screenshots, or Markdown.

## 4. Required member sign-in flow

JOESE should use a backend-for-frontend Authorization Code flow:

1. The JOESE backend generates a high-entropy `state`, OIDC `nonce`, and PKCE
   `code_verifier`.
2. It stores their digests in a short-lived, one-use login transaction tied to
   the browser.
3. It calculates `code_challenge = BASE64URL(SHA256(code_verifier))` and
   redirects to JoeAuth `/oauth/authorize` with:
   - exact `client_id` and registered `redirect_uri`;
   - `response_type=code`;
   - `scope=openid profile email offline_access`;
   - `code_challenge_method=S256`;
   - `code_challenge`, `state`, and `nonce`.
4. JoeAuth authenticates the person, displays its account chooser and consent
   when required, and returns a single-use code to the exact callback.
5. The JOESE backend rejects a missing, expired, mismatched, or already-used
   local login transaction and compares `state` in constant time.
6. The backend exchanges the code within 60 seconds at `/api/oauth/token`,
   supplying the exact redirect URI, PKCE verifier, client ID, and client secret.
7. The backend validates the ID/access token and obtains current identity data
   through UserInfo or introspection.
8. JOESE links or loads the local product member and creates its own random,
   server-stored, HttpOnly JOESE session.

PKCE, `state`, and `nonce` are mandatory in JOESE even though the reviewed
JoeAuth routes allow some of them to be omitted.

## 5. Token validation requirements

Do not copy JoeAuth's illustrative `keys[0]` verification snippet directly.
JOESE token validation must:

- pin the expected HTTPS issuer from reviewed discovery configuration;
- accept only `alg=EdDSA` and select the JWKS key by `kid`;
- refresh JWKS once on an unknown `kid` and respect cache headers;
- verify signature, `exp`, and any `nbf`;
- reject unreasonable future `iat` values;
- require exact `iss` and exact JOESE `aud`/`client_id`;
- require `token_type=user` for a member login;
- require `openid`, `profile`, and `email` in the effective scope;
- compare the ID-token `nonce` to the one-use login transaction; and
- require a non-empty stable `sub` and `email_verified=true` before membership
  activation or linking.

JoeAuth's local JWT verification helper checks signature and time but leaves
issuer and audience checks to its caller. Its introspection endpoint can report
a correctly signed token as active without limiting that response to the
token's audience. JOESE must therefore compare returned `iss`, `aud`,
`client_id`, `token_type`, and `sub` even after successful introspection.

## 6. Product session and token custody

JoeAuth bearer, ID, authorization, and refresh tokens never enter
`localStorage`, `sessionStorage`, URLs beyond the short-lived authorization code,
or ordinary JOESE cookies.

After the callback, JOESE creates a product-scoped opaque session cookie with
`Secure`, `HttpOnly`, and an appropriate `SameSite` value. The JOESE database
stores only the session digest and the linked local member ID.

If JOESE requests `offline_access`, it must rotate refresh tokens atomically and
store the current plaintext refresh token encrypted at rest with a separate
Worker secret. A failed or replayed rotation revokes the local product session.
If secure refresh-token custody is not ready, omit `offline_access` and require a
new JoeAuth authorization after the short product session expires.

## 7. Identity link and local membership

Add a nullable, unique `joe_auth_user_id` to the local JOESE member identity or
use a dedicated identity-link table. It stores JoeAuth `sub`, not email.

JOESE keeps its existing local user/member ID because orders, trades, holdings,
transfers, loans, ledger entries, comments, invitations, audit records, and the
J$10,000 opening-balance event already reference it.

JoeAuth authenticates the person. JOESE still owns:

- whether the person is a JOESE member;
- invitation redemption and closed-beta eligibility;
- member, market-operator, and administrator roles;
- product suspension and financial classification;
- starting-balance eligibility;
- trading permissions and market restrictions; and
- every financial and audit record.

The JoeAuth `role` claim is global and currently only distinguishes `user` and
`admin`. It must never automatically grant JOESE operator or administrator
access. JOESE local roles remain server-enforced.

## 8. Existing-account linking

Account linking is a high-risk, one-time operation:

1. The member signs in to JoeAuth and completes the JOESE callback.
2. The JoeAuth token must contain a verified email.
3. The member proves control of the existing JOESE account through its current
   authenticated session or a dedicated, short-lived link confirmation.
4. JOESE checks that neither the JoeAuth `sub` nor local user is already linked
   elsewhere.
5. JOESE records the link, actor, time, request ID, old verified email, and
   JoeAuth verified email in an audit event.
6. Existing financial records remain under the same JOESE user ID.
7. The link operation never grants another opening balance or replays an
   invitation.

An equal email address may suggest a candidate but is not sufficient by itself
to link financial history. Email is mutable. Conflicts, changed school domains,
duplicate accounts, or an inaccessible legacy account require an administrator
review and an attributed decision.

## 9. New-member onboarding after migration

After the cutover, a new person authenticates and verifies email through
JoeAuth. On first arrival JOESE creates no financial member automatically.
Instead it performs local product onboarding:

1. require `email_verified=true` and an allowed school domain;
2. require and redeem an eligible JOESE invitation when closed beta still uses
   invitations;
3. ensure the JoeAuth `sub` has no prior JOESE membership;
4. create the local member linked to `sub`; and
5. issue the J$10,000 opening balance exactly once through the existing guarded
   ledger transition.

JoeAuth account creation and JOESE membership creation are separate events.

## 10. Console and service authorization

The Operations Console uses its own JoeAuth client. Successful JoeAuth login is
necessary but not sufficient: the linked local JOESE user must hold the exact
operator/administrator role required by the endpoint. Role changes remain local
audited JOESE operations unless a future JoeAuth entitlement protocol is
designed.

For `client_credentials` tokens, a JOESE service must validate EdDSA signature,
issuer, `token_type=app`, the emitted audience, and an exact allowlist of
`client_id`/`app_id`. The reviewed JoeAuth implementation accepts an arbitrary
syntactically valid requested app scope, so a scope string alone is not
authorization.

## 11. Logout, suspension, and identity changes

Product logout should:

1. delete the JOESE local session;
2. revoke the stored JoeAuth refresh token when present; and
3. clear only JOESE cookies.

The reviewed discovery document has no standard OIDC `end_session_endpoint`,
back-channel logout, or account-change webhook. Logging out of JOESE therefore
does not necessarily end the JoeAuth browser SSO session, and suspending a
JoeAuth account does not instantly push a logout to JOESE.

Until JoeAuth supplies lifecycle events, JOESE should introspect before every
sensitive write and cache the live result only briefly. A locally verified
access token may remain cryptographically valid for up to 15 minutes after a
JoeAuth suspension. JOESE local suspension always takes effect immediately.

Name, avatar, verified email, and global account status may be refreshed from
UserInfo/introspection. A JoeAuth email change does not silently change JOESE
eligibility or transfer ownership; it triggers a local review when the school
domain or identity policy is affected.

## 12. JoeAuth readiness gates before central migration

The reviewed repository is a strong functional prototype, but central identity
raises the impact of every security decision. Before JOESE passwords and login
are retired, the Joe Team should review and resolve:

1. **Password hashing:** JoeAuth currently uses a fast salted HMAC-SHA256 with a
   pepper. A central password database should use a deliberately slow,
   reviewed password KDF with a migration/versioning path.
2. **Superuser authentication:** the reviewed superuser comparison uses a
   single SHA-256 hash. Replace it with a high-entropy credential and stronger
   admin authentication, ideally including MFA and recovery procedures.
3. **Confidential refresh grants:** the current refresh route validates a client
   secret only when one is supplied. Confidential applications should be
   required to authenticate on refresh.
4. **Logout and events:** add a standard end-session design and signed account
   lifecycle events or another reliable revocation mechanism.
5. **Key rotation:** document overlapping JWKS keys, `kid` rollover, emergency
   revocation, and client cache behavior.
6. **App-token authorization:** restrict service scopes at issuance and require
   audience-specific target validation.
7. **OIDC conformance and security review:** test PKCE, code handling, redirect
   validation, refresh reuse, token audience, consent, and multi-account flows
   independently before financial applications rely on them.
8. **Recovery and operations:** define backups, audit retention, email-delivery
   monitoring, incident ownership, and a safe account-recovery process.

JOESE should not weaken its current password or session controls merely to meet
a date. The local system remains the rollback path until these gates and the
account-link reconciliation pass.

## 13. Delivery sequence and acceptance tests

1. Freeze the reviewed JoeAuth issuer contract and register staging clients.
2. Implement discovery/JWKS validation and callback state tests in staging.
3. Add nullable identity links without changing current login.
4. Test explicit linking with copied production-like records.
5. Add JoeAuth login alongside legacy login for a short, audited linking window.
6. Reconcile every local user, opening balance, role, and link conflict.
7. Switch new membership onboarding to JoeAuth plus local JOESE invitation.
8. Disable new local passwords only after rollback rehearsal.
9. Revoke legacy JOESE sessions at the final cutover, retaining historical user
   IDs and all financial records.
10. Remove legacy password material only under a separately reviewed retention
    plan after the rollback window.

Minimum tests include state/nonce replay, wrong audience/issuer, unknown `kid`,
expired code, refresh rotation race, suspended JoeAuth user, local suspension,
email change, duplicate link, callback tampering, account chooser, console role
isolation, service-token allowlists, and proof that linking cannot create a
second J$10,000 opening balance.

See also the
[Joe Banking JoeAuth adaptation](../../joe-banking/docs/joeauth-adaptation.md)
for the shared identity and financial-service boundary.

