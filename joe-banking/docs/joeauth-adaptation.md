# Adapting Joe Banking to JoeAuth

## 1. Scope and reviewed source

Joe Banking will use the Joe Team's open-source JoeAuth service for identity and
single sign-on while keeping all banking accounts, balances, wires, deposits,
loans, permissions, and audit records inside the banking system.

This design was reviewed against
[Histar4522/JoeAuth](https://github.com/Histar4522/JoeAuth) at commit
`e9d5fa8d8be7b83d4333c2fd1b4f53af1d741932` from November 12, 2026. The
deployed discovery document and source must be checked again before banking
implementation because JoeAuth is still under active development.

This document changes no JoeAuth or banking scripts. It defines the contract a
future banking implementation should follow.

## 2. Trust boundary

JoeAuth answers **who the person is**. Joe Banking answers:

- whether that person has an active banking customer;
- which bank account and JOESE membership are linked;
- what the person may do in the banking product;
- all balances, holds, deposits, wires, loans, and interest; and
- whether banking activity is active, frozen, restricted, or closed.

The stable identity key is JoeAuth's `sub`. Banking stores it as the unique
`joe_auth_user_id` on `bank_customers`. There is no database foreign key into
JoeAuth D1 and no financial record uses email as ownership proof.

JoeAuth's global `role` currently distinguishes `user` and `admin`. It must not
grant loan-review, rate-policy, investigation, correction, or banking-admin
permissions. Those remain banking-specific server-side entitlements.

## 3. Reviewed JoeAuth protocol

Joe Banking can rely on these reviewed interfaces after verifying them in the
deployed discovery metadata:

- `GET /.well-known/openid-configuration`
- `GET /.well-known/jwks.json`
- `GET/POST /oauth/authorize`
- `POST /api/oauth/token`
- `GET /api/oauth/userinfo`
- `POST /api/oauth/introspect`
- `POST /api/oauth/revoke`

JoeAuth supports Authorization Code, refresh-token rotation, and
`client_credentials`. It signs access and ID tokens with Ed25519/EdDSA.

| Artifact | Reviewed lifetime |
| --- | ---: |
| Authorization code | 60 seconds, single use |
| User access token | 15 minutes |
| ID token | 1 hour |
| Rotating refresh token | 30 days |
| App access token | 1 hour |

The standard identity scopes are `openid`, `profile`, `email`, and
`offline_access`. Banking permissions are not JoeAuth scopes in the reviewed
implementation.

## 4. JoeAuth client separation

Create at least three JoeAuth applications:

1. **Joe Banking Member** — interactive member callback; allowed scopes
   `openid profile email offline_access`.
2. **Joe Banking Console** — separate callback and secret for banking staff.
3. **JOESE Banking Settlement** — service client using `client_credentials`
   for JOESE-to-bank hold and settlement calls.

If scheduled banking workers need a service identity, give them another client
rather than sharing the JOESE secret. Exact client IDs are mapped to exact
banking permissions in banking configuration.

Client secrets are displayed once by JoeAuth. Store them only in the relevant
Worker secret store. The browser receives neither client secrets nor refresh
tokens.

## 5. Member browser flow

Use a backend-for-frontend flow:

1. The banking backend creates a high-entropy `state`, OIDC `nonce`, and PKCE
   verifier, storing a one-use short-lived login transaction.
2. It redirects to JoeAuth `/oauth/authorize` with exact client/callback,
   `response_type=code`, scopes, `state`, `nonce`, and S256 challenge.
3. JoeAuth performs login, account selection, and consent when required.
4. The callback verifies `state` before accepting the code.
5. The banking backend exchanges the code within 60 seconds using the PKCE
   verifier and its client secret.
6. It validates the ID/access token, checks live user status through UserInfo or
   introspection, and requires `email_verified=true`.
7. It loads or provisions the linked banking customer and creates a random,
   opaque, product-scoped HttpOnly banking session.

Banking requires PKCE S256, `state`, and `nonce` even though the reviewed
JoeAuth implementation treats some as optional. No token is stored in browser
storage.

## 6. Token validation

Banking's validator must:

- pin the expected HTTPS issuer;
- allow only EdDSA and select JWKS by `kid`;
- verify signature, expiry, any `nbf`, and reasonable `iat`;
- require exact `iss` and member-banking client `aud`/`client_id`;
- require `token_type=user`, expected scopes, stable `sub`, and matching nonce;
- require `email_verified=true` for a banking customer; and
- compare every introspection result's issuer, audience, client, type, and
  subject rather than trusting `active=true` alone.

The reviewed JoeAuth verification helper does not itself enforce issuer or
audience, and introspection can describe a signed token issued to another
client. Banking performs those checks independently.

JWKS handling supports multiple simultaneous keys even though the reviewed
JoeAuth deployment currently publishes one. On an unknown `kid`, refresh JWKS
once; never fall back to an arbitrary first key.

## 7. High-assurance checks for financial writes

A cryptographically valid 15-minute access token can remain valid briefly after
JoeAuth suspends an account. Until JoeAuth offers signed lifecycle events or
back-channel logout, Banking should perform a live status check before:

- sending, receiving, declining, or cancelling a wire;
- funding or withdrawing a deposit;
- opening a term deposit;
- submitting, accepting, or repaying a loan;
- changing a security-sensitive account link; or
- executing console or correction actions.

The live result may be cached for a very short period only when the risk model
allows it. Banking's own freeze and entitlement checks always run locally and
take effect immediately.

Read-only balance pages may use the local banking session between these checks,
but they never trust identity fields supplied by the browser.

## 8. Banking customer provisioning

On first valid JoeAuth arrival:

1. Search by JoeAuth `sub` only.
2. If already linked, load the existing banking customer.
3. If unlinked but an eligible legacy JOESE member exists, enter the explicit
   linking flow rather than creating a second customer.
4. Otherwise apply the approved banking eligibility policy.
5. Create one banking customer and transaction account with `sub` uniqueness.

Name, picture, and verified email come from UserInfo/introspection for display
and may be cached. Changing them does not create a new banking customer or
change financial ownership.

JoeAuth registration never creates J$ by itself. The JOESE-to-bank opening
balance migration and any future product eligibility remain separately guarded
financial operations.

## 9. Linking JOESE, JoeAuth, and Banking

The durable identity chain is:

```text
JoeAuth sub
  ├── JOESE local user/member ID
  └── Joe Banking customer ID
```

JOESE and Banking keep their own immutable IDs and histories. The same JoeAuth
`sub` may link to at most one active JOESE member and one active banking
customer.

During migration, a person must authenticate to JoeAuth and prove control of
the existing JOESE account. An equal email address is evidence, not sufficient
proof. Linking records the two product IDs, JoeAuth subject, prior verified
email, actor, time, and migration batch.

The balance migration follows `accounts-ledger-and-joese.md`: reconcile the
existing JOESE disposable balance, post it once to the banking ledger, then make
Joe Banking authoritative. JoeAuth linking does not issue J$ or replay the
JOESE J$10,000 opening balance.

## 10. Service-to-service settlement

JOESE may obtain a JoeAuth app token through `client_credentials`. Banking must
validate:

- EdDSA signature and exact issuer;
- `token_type=app`;
- the audience emitted for app tokens;
- exact allowlisted JOESE `client_id` and `app_id`;
- token expiry and `jti`; and
- the requested banking operation against Banking's local service-permission
  map.

Do not authorize a JOESE settlement merely because the token says
`scope=app:service`. The reviewed JoeAuth token route accepts arbitrary
syntactically valid requested service scopes, so target-side client allowlisting
is mandatory.

Every hold, settlement, release, and sale credit still requires Banking's own
idempotency key, JOESE order/trade reference, member ownership check, and ledger
rules. JoeAuth authenticates the calling service; it does not approve a money
movement.

## 11. Console access

The Banking Console authenticates through its separate JoeAuth client, then
requires local banking entitlements. A JoeAuth `admin` receives no banking
console access unless a banking administrator has granted the corresponding
local role.

Rate changes, loan offers, freezes, corrections, and role assignments remain
attributed Banking audit events. Operator and administrator identities use
JoeAuth `sub`; their permissions and separation-of-duties rules live in
Banking.

## 12. Sessions, refresh, and logout

Banking creates a local opaque session after JoeAuth callback. If it requests
`offline_access`, refresh rotation occurs only on the server and is atomic. The
current refresh token is encrypted at rest with a separate Worker-held key. A
reuse or rotation conflict revokes the entire banking session.

Product logout deletes the banking session and calls JoeAuth refresh-token
revocation when applicable. The reviewed JoeAuth discovery has no standard
`end_session_endpoint`, so this does not necessarily clear the JoeAuth browser
SSO session or sign the user out of JOESE.

A future **Sign out of the Joe Universe** feature requires an explicit JoeAuth
end-session and product-notification design. It must not be simulated by giving
every subdomain access to one wildcard session cookie.

## 13. JoeAuth readiness gates for financial use

Banking should not launch on central JoeAuth until the following items are
reviewed and resolved or formally risk-accepted:

1. Replace the current fast HMAC-SHA256 password storage with a deliberately
   slow, versioned password KDF suitable for central identity.
2. Replace the single-SHA-256 superuser secret with stronger admin
   authentication, MFA, recovery, and audit controls.
3. Require confidential clients to authenticate on refresh-token grants.
4. Add a standard logout/account-event mechanism so suspension, deletion,
   email verification changes, and credential resets reach financial products.
5. Define overlapping Ed25519 key rotation and emergency revocation.
6. Restrict app-token scopes/audiences and document service authorization.
7. Complete an independent OIDC/OAuth security and conformance review.
8. Define JoeAuth backup restoration, audit retention, Resend monitoring,
   secret rotation, and incident ownership.

These gates are more important for Banking than for an ordinary profile site
because identity mistakes can move or expose fictional financial balances.

## 14. Delivery sequence and tests

1. Register staging member, console, and service clients in JoeAuth.
2. Freeze issuer/callback/scopes and implement strict validation tests.
3. Add `joe_auth_user_id` to banking design and prototype provisioning without
   moving J$.
4. Test explicit JOESE/JoeAuth/Banking linking on copied data.
5. Add local banking sessions and live checks for financial writes.
6. Test service-token allowlists against JOESE hold and settlement APIs.
7. Rehearse balance migration and rollback.
8. Canary with staff, then linked beta members.
9. Cut over only after identity-link and financial reconciliation totals match.

Minimum tests include wrong issuer/audience/client, state and nonce replay,
unknown `kid`, expired code, refresh-family reuse, JoeAuth suspension between
page load and wire submission, local banking freeze, duplicate `sub`, changed
email, console-role isolation, forged app scope, wrong service client, and proof
that linking cannot duplicate the JOESE opening balance.

See also the
[JOESE JoeAuth adaptation](../../joe-stock-exchange/docs/joeauth-adaptation.md)
for product membership, legacy-account linking, and stock-market roles.

