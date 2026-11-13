# Product and architecture

## 1. Purpose

Joe Banking gives a Joe Universe member one coherent place to manage liquid J$,
send receiver-approved wires, save through flexible or fixed-term deposits, and
use disclosed fictional loans. It connects to JOESE without turning banking
records into stock-market records or duplicating balances.

The product has three surfaces:

1. **Member banking site** — account balances, wires, rates, deposits, loans,
   inbox decisions, and history.
2. **Banking Operations Console** — rate adjustments, loan review, transaction
   investigation, corrections, scheduled jobs, and audit records.
3. **Banking API and scheduled engine** — the source of truth for balances,
   reservations, contracts, interest, settlement, and integration events.

## 2. Product boundaries

Joe Banking never handles real money. The words bank, deposit, wire, loan,
interest, and account describe fictional J$ simulation mechanics only.

The first release does not include:

- payment requests, invoices, pull payments, direct debits, or recurring debit
  mandates;
- real bank connections, cards, checks, cash deposits, cash withdrawals, or
  currency exchange;
- anonymous accounts or a second banking account for the same JoeAuth person;
- silent operator balance edits or retroactive interest-rate changes;
- transfer reversal after a receiver has accepted, except through a separately
  recorded administrator correction; or
- an operator account that can also use member banking, borrow, or trade.

## 3. Service ownership

| Concern | Owning system |
| --- | --- |
| Identity, verified email, global display name, login, recovery | JoeAuth |
| Liquid J$ balance, holds, wires, deposits, loans, interest | Joe Banking |
| Stock/crypto/shareholding assets, orders, trades, prices | JOESE |
| Shared universe navigation and product discovery | Joe Universe site |
| Published market and banking news | Shared news identity with product-specific effects |

JoeAuth identifies the person but never becomes a financial ledger. Joe Banking
stores `joe_auth_user_id` as an external identity reference. JOESE stores its
own product membership and portfolio data and links to the same JoeAuth person.

## 4. One-balance rule

The banking transaction account is the authoritative liquid balance. JOESE's
current `disposable_balance_cents` becomes a transitional cache only, then is
removed or replaced by a bank balance projection after migration.

JOESE operations use banking reservations:

1. A buy order requests a hold from Joe Banking.
2. Joe Banking reduces the member's available balance while preserving the
   posted balance.
3. A fill settles the required J$ from the hold to exchange clearing.
4. A cancellation releases the unused hold.
5. A completed sale credits the member's banking transaction account.

Every request uses an idempotency key and an immutable JOESE reference. A retry
cannot reserve, settle, release, or credit the same amount twice.

## 5. High-level components

```text
JoeAuth
  └── stable person ID and application authorization

Joe Banking API
  ├── customer/account service
  ├── double-entry ledger and holds
  ├── member wire service
  ├── deposit service
  ├── loan service
  ├── rate policy and interest engine
  ├── console/audit service
  └── JOESE settlement adapter

JOESE API
  ├── portfolio and holdings
  ├── orders and trades
  └── bank reservation/settlement client
```

The banking API should deploy independently from JOESE so a stock-market
release cannot alter banking contracts or interest calculations. Cross-service
operations use an outbox/inbox record and reconciliation job rather than an
untracked sequence of HTTP calls.

## 6. Money states

The member summary distinguishes:

- **Available balance** — transaction-account J$ that can be wired, deposited,
  repaid, or reserved for a JOESE order.
- **Held balance** — posted transaction-account J$ reserved for a pending wire
  or JOESE order.
- **Flexible deposit** — withdrawable savings principal plus posted interest.
- **Term deposits** — locked principal and accrued interest until maturity.
- **Loan liability** — principal plus any posted or accrued interest owed.
- **JOESE assets** — read-only linked value supplied by JOESE; never included in
  available bank balance.

The home page may show a combined net-position estimate, but it must not label
stock value, term deposits, or unused loan capacity as spendable J$.

## 7. Time and scheduling

Product rules use `America/New_York` as their business time zone. Durable
timestamps are stored in UTC. Jobs derive a stable business-period key so a
retry cannot post the same interest period or maturity twice.

The banking week is Monday 12:00 AM through the following Monday 12:00 AM in
New York. Rate-change limits use that calendar week. Interest is quoted weekly,
accrued proportionally over time, and posted on a documented weekly boundary or
at contract maturity.

