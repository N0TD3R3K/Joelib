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

An account represents one person. JOESE permits one active member account per
verified school email address and requires the address to belong to an approved
school email domain. The domain allowlist is server-side configuration; a
personal email address cannot be used as a substitute. Suspected duplicate
accounts must be reviewed and resolved by an administrator with an audit entry.

The intended registration flow is:

1. A prospective member supplies an invitation phrase in the field labeled
   **“6-Digit Invite Code.”** The field accepts a long copy-pasted Joe phrase
   containing letters and numbers; the label is intentionally part of the
   product's tone, not a claim that the phrase is six digits.
2. The member chooses a display name, approved school email address, and
   password.
3. JOESE verifies that the invitation is valid, available, and eligible for the
   registration attempt, and that the school email does not already have an
   active member account.
4. JOESE sends a verification email to that school address.
5. After the school email is verified, the account is activated and receives
   **J$10,000.00 of disposable starting balance** exactly once.

Production verification links are single-use and default to a 24-hour lifetime.
The sign-in screen provides a neutral, Turnstile-protected resend flow. Issuing
a replacement link invalidates older unused links. Administrators may also
resend or cancel an activity-free pending registration from the Members page.

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
- Treat a verified school email as the account's unique eligibility identity.
  An email-address change, duplicate-account exception, or account merge needs
  an administrator review, member confirmation where possible, and an audit
  record; it must never issue a second starting balance.

## Passwords, sessions, and recovery

JOESE uses email-and-password sign-in after initial verification. Email is used
for verification and a neutral password-recovery flow; an operator cannot
silently replace a member's password.

- Passwords are stored with chained PBKDF2-SHA-256, a unique 16-byte salt, 210,000
  total iterations split into Cloudflare-compatible phases with separate domain labels
  iterations, and a 256-bit result. No password or reversible encryption key
  may be committed or logged.
- Sessions use secure, `HttpOnly` cookies with appropriate `Secure` and
  `SameSite` attributes. Server-side session validation must include account
  status and role.
- Session renewal, logout, password reset, email verification, role changes,
  and account disablement must invalidate or re-evaluate affected sessions.
- Password-reset messages use 15-minute, single-use, server-hashed tokens and
  neutral account-enumeration-resistant responses. Completing a reset revokes
  every existing session for the account.
- The product must provide a documented account-disable and session-revocation
  path for administrators.

Sessions use random 32-byte bearer tokens, store only a secret-peppered SHA-256
digest in D1, and expire after 30 days. Authentication-record retention still
requires a reviewed production policy before public membership opens.

## Email delivery

Transactional messages should be sent from `noreply@joese.derekli.dev` through
Cloudflare Email Sending or Resend. Normal Gmail SMTP is not the login-email
delivery service. A dedicated Gmail inbox may instead be a human support or
forwarding destination.

Store the Resend provider message ID for each verification and password-reset
message. A signature-verified webhook records accepted, delayed, delivered,
bounced, suppressed, complained, and failed states without storing plaintext
verification or recovery tokens.

Email templates must state that JOESE is a fictional simulation and must never
include an invitation phrase, password, full session token, or trading account
details beyond what is necessary for the requested action.

## Abuse prevention

Signup, login, password-reset request, and password-reset completion use
Cloudflare Turnstile with server-side validation. Cloudflare rate limits must be
configured by account identifier and network signal as appropriate; public
responses avoid revealing account existence.

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
