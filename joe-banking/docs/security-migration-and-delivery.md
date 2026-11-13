# Security, migration, and delivery plan

## 1. JoeAuth integration

Joe Banking should not create a new independent password system shortly before
JoeAuth becomes available. Its authentication boundary is designed around a
stable JoeAuth subject ID and application-specific authorization.

Recommended browser flow:

1. Joe Banking redirects to JoeAuth using Authorization Code with PKCE.
2. JoeAuth returns a short-lived code to the exact registered banking callback.
3. The banking backend exchanges the code and creates its own secure,
   HttpOnly application session.
4. Banking authorization checks customer status and banking entitlements on
   every request.

A wildcard cookie shared directly across every `joe-univer.se` subdomain is not
recommended. JoeAuth supplies unified sign-in; each product keeps a scoped
session so one compromised site cannot read every product's session token.

Until JoeAuth launches, a narrow adapter may validate an existing JOESE session
and map its exact user ID. The adapter is temporary, does not copy passwords,
and cannot create a second opening balance.

## 2. Proposed host layout

Final hostnames remain a universe-level decision. A compatible proposal is:

- `joe-univer.se` — universe home;
- `auth.joe-univer.se` — JoeAuth;
- `bank.joe-univer.se` — member banking;
- `bank-console.joe-univer.se` — protected banking console;
- `bank-api.joe-univer.se` — banking API; and
- a separate JOESE member, console, and API host under the same base domain.

The **Back to Universe** control remains inert until the home page and final URL
are ready.

## 3. Roles and separation of duties

Suggested banking entitlements:

| Entitlement | Capabilities |
| --- | --- |
| Banking member | Own balances, wires, deposits, applications, contracts, repayments |
| Loan operator | Review applications and prepare offers |
| Rate-policy operator | Submit bounded rate adjustments |
| Banking investigator | Read transactions and reconciliation without changing money |
| Banking administrator | Freeze access, approve corrections, assign banking roles |

An operator or administrator cannot simultaneously use member banking or trade
through JOESE. High-risk corrections should require a second authorized person
when the team is large enough to support dual approval.

## 4. Security controls

- Exact-origin CORS and CSRF protection for browser writes.
- Secure HttpOnly app sessions with rotation, expiry, and revocation.
- Server-side JoeAuth issuer, audience, nonce, state, and PKCE validation.
- Service authentication and narrowly scoped credentials for JOESE integration.
- Turnstile and layered rate limits for login handoff, recipient lookup, wires,
  loan applications, and sensitive console actions.
- Idempotency keys and one-time transition locks for financial writes.
- Encryption in transit and secret storage outside source control.
- Log redaction for sessions, codes, tokens, exact credentials, and sensitive
  member data.
- Dependency review, D1 backup/restore testing, incident ownership, and a
  documented freeze mode.

JoeAuth compromise or deactivation revokes product sessions through an event or
short session lifetime. A banking freeze blocks new outgoing activity without
deleting history or silently resolving pending obligations.

## 5. Privacy

The member app receives only the signed-in person's banking data. The console
shows the minimum data required by each entitlement. JOESE receives reservation
and settlement information needed for the linked member, not deposits, loans,
wire counterparties, or general banking history.

Email and display name come from JoeAuth for presentation. Banking records use
the stable subject ID so a name or email change does not transfer ownership or
create another account.

## 6. Migration from current JOESE

Migration is a financial change and requires a rehearsed maintenance window:

1. Export and back up production JOESE D1.
2. Build and test a read-only reconciliation report for every member balance,
   open order hold, pending transfer, loan, and ledger checkpoint.
3. Decide how existing JOESE pending transfers and embedded Joe Bank loans map
   to the new banking products.
4. Create JoeAuth or temporary identity links without changing financial IDs.
5. Pause JOESE balance-changing writes.
6. Reconcile again and migrate one opening balance per member.
7. Migrate or resolve existing holds, pending transfers, and loan liabilities.
8. Switch JOESE to banking holds and settlements.
9. Compare member totals and system-wide totals before reopening.
10. Keep a rollback checkpoint and do not delete legacy ledger data.

The migration must explicitly address the existing JOESE statement that
prohibits leverage if accepted banking loans are allowed to fund stock
purchases. The product documentation and UI must agree before launch.

## 7. Staged delivery plan

### Phase 0 — Confirm policy

- Approve initial Joe Rate.
- Decide loan catalog and repayment rules.
- Decide loan-proceeds eligibility for JOESE.
- Approve early term-deposit behavior.
- Confirm roles and final hostnames.

### Phase 1 — Ledger foundation

- Create a separate banking project and D1 database.
- Implement customer links, accounts, double-entry ledger, projections, holds,
  idempotency, audit, outbox, and reconciliation.
- Add invariant and concurrency tests before any member UI.

### Phase 2 — JoeAuth and member shell

- Integrate JoeAuth or the temporary JOESE adapter.
- Build the white member shell, required navigation, account summary, inbox,
  and activity history.
- Keep Back to Universe inert.

### Phase 3 — Wires

- Implement send-only receiver-approved wires.
- Test duplicate submission, simultaneous resolution, insufficient balance,
  account isolation, and notification behavior.

### Phase 4 — Rate and deposits

- Implement policy history, twice-weekly enforcement, scheduled accrual,
  flexible savings, fixed-term contracts, and maturity.
- Run time-zone, daylight-saving, rounding, replay, and missed-job tests.

### Phase 5 — Loans

- Implement only after policy decisions are approved.
- Add application, offer, acceptance, accrual, repayment, and contract history.
- Migrate existing embedded JOESE Joe Bank liabilities through an explicit
  adapter or conversion batch.

### Phase 6 — JOESE connection

- Run shadow reconciliation without moving money.
- Rehearse the production migration on a database copy.
- Move liquid balances once, enable holds/settlements, and monitor differences.
- Remove JOESE's authority to independently mutate disposable balance.

### Phase 7 — Beta and domain move

- Use a separate test environment and test identities.
- Complete backup restoration and incident drills.
- Canary with administrators, then a few members, then the wider beta.
- Move to final `joe-univer.se` hosts only after JoeAuth callbacks, cookies,
  CORS, email links, and service audiences are verified together.

## 8. Minimum test gates

- Ledger lines balance for every transaction type.
- No duplicate wire, interest, maturity, loan, JOESE hold, or settlement on
  retry.
- Two rate changes succeed in one week; a third fails even concurrently.
- Rate delta and 0.300%–2.000% bounds are exact at every boundary.
- Fixed contracts ignore future variable-rate changes.
- Accrual splits correctly at rate, principal, repayment, and maturity events.
- Receiver approval is required; no request-payment route exists.
- One member cannot read or mutate another member's data.
- JoeAuth logout/disablement and banking freeze stop outgoing writes.
- JOESE and bank balances reconcile before and after migration.
- A tested rollback restores the prior release without replaying financial
  postings.

