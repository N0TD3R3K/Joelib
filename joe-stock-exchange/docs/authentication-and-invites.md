# JOESE authentication and invitations

## Scope

JOESE uses its own member-account system. Normal member access must not depend
on Cloudflare Zero Trust. Zero Trust may be an additional protection for the
internal Operations Console during early testing, but it does not replace JOESE
roles, sessions, invitation checks, or audit records.

JOESE has three server-enforced roles:

| Role | Core permissions |
| --- | --- |
| Member | View the member exchange and Joe Wire; manage own account; place permitted simulated trades. |
| Market operator | Create/schedule Joe Wire events; view market-monitor and audit tools; cannot trade. |
| Administrator | Manage members and authorized roles; access necessary operational controls; cannot bypass audit requirements. |

A market operator or administrator must not have an active trading entitlement.
Changing a role is an attributed audit event and may not be implemented as a
client-only UI restriction.

## Registration and verification

The intended registration flow is:

1. A prospective member supplies an invitation phrase in the field labeled
   **“6-Digit Invite Code.”** The field accepts a long copy-pasted Joe phrase
   containing letters and numbers; the label is intentionally part of the
   product's tone, not a claim that the phrase is six digits.
2. The member chooses a display name, email address, and password.
3. JOESE verifies that the invitation is valid, available, and eligible for the
   registration attempt.
4. JOESE sends a verification email.
5. After the email is verified, the account is activated and receives the
   configured J$10,000.00 starting balance exactly once.

An account must not receive its opening balance, view a trading-enabled
portfolio, or execute trades until it has completed verification.

## Invitation safeguards

- Store an invitation phrase only as a secure server-side hash. Do not place it
  in browser code, committed seed data, logs, documentation, email templates,
  screenshots, or client-accessible configuration.
- Prefer an individually issued, revocable phrase for each member. This limits
  the effect of a leaked phrase and creates a clear invitation audit trail.
- If a shared phrase is ever used, it needs a registration cap, expiry/revocation
  controls, and manual membership-review audit records.
- Record invitation creation, issuance, attempted use, successful redemption,
  revocation, and expiration without storing the plaintext phrase.
- Rate-limit failed invitation attempts and return neutral error messages that
  do not reveal which phrases or email addresses are valid.

## Passwords, sessions, and recovery

JOESE uses email-and-password sign-in after initial verification. Email is for
verification and password recovery, not a requirement for every ordinary login.

- Passwords must be stored only with an approved modern password-hashing
  strategy; no password or reversible encryption key may be committed or logged.
- Sessions use secure, `HttpOnly` cookies with appropriate `Secure` and
  `SameSite` attributes. Server-side session validation must include account
  status and role.
- Session renewal, logout, password reset, email verification, role changes,
  and account disablement must invalidate or re-evaluate affected sessions.
- Password-reset messages must use short-lived, single-use, server-stored or
  securely verifiable tokens and neutral account-enumeration-resistant responses.
- The product must provide a documented account-disable and session-revocation
  path for administrators.

The exact password-hashing algorithm, session lifetime, recovery-token storage,
and retention policy must be selected and reviewed before implementation.

## Email delivery

Transactional messages should be sent from `noreply@joese.derekli.dev` through
Cloudflare Email Sending or Resend. Normal Gmail SMTP is not the login-email
delivery service. A dedicated Gmail inbox may instead be a human support or
forwarding destination.

Email templates must state that JOESE is a fictional simulation and must never
include an invitation phrase, password, full session token, or trading account
details beyond what is necessary for the requested action.

## Abuse prevention

Signup, login, and password-reset flows use Cloudflare Turnstile with
server-side validation. The service must rate-limit by account identifier and
network signal as appropriate, log security-relevant outcomes, and avoid
revealing account existence in public responses.

If passwordless links are later added, they are optional and must meet these
limits:

- no more than three per address in 30 minutes;
- no more than five per address per day;
- no more than ten per IP address per hour;
- expiry after 10–15 minutes; and
- invalidation of earlier unused links when a newer link is issued.

## Privacy and audit boundaries

The member exchange exposes only the signed-in member's own account, portfolio,
trades, and ordinary market information. Operations screens expose only the
minimum account data needed for their role. Authentication, invitation, role,
and security actions are auditable, but the audit record must avoid retaining
passwords, plaintext invitations, or reusable secrets.
