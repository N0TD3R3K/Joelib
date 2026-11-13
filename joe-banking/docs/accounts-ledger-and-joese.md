# Accounts, ledger, and JOESE integration

## 1. Customer and account relationship

One JoeAuth person may have one active Joe Banking customer. That customer owns
one J$ transaction account, one flexible deposit account, any number of matured
or closed historical term deposits, active fixed-term deposits subject to
product limits, and eligible loan contracts.

Before JoeAuth launches, `legacy_identity_links` maps exactly one existing JOESE
member to exactly one banking customer. Email is migration evidence and a
display field, not the durable cross-product foreign key.

## 2. Double-entry ledger

Joe Banking uses an append-only double-entry ledger. Every posted transaction
has at least two balanced lines and a unique business reference. Cached balances
may improve reads, but the ledger remains the reconciliation source of truth.

Minimum internal ledger accounts include:

- member transaction-account liability;
- member flexible-deposit liability;
- member term-deposit liability;
- member loan receivable;
- accrued deposit-interest payable;
- accrued loan-interest receivable;
- bank interest expense and interest income;
- member-wire clearing;
- JOESE clearing; and
- reviewed correction/rounding accounts.

All member-visible amounts use integer cents. Interest calculations retain a
fixed-point sub-cent remainder so repeated accrual does not lose value. Binary
floating-point numbers must not be used for durable money or rate calculations.

## 3. Posted, held, and available balances

```text
available transaction balance
  = posted transaction-account balance
  - active outgoing-wire holds
  - active JOESE order holds
  - other explicitly disclosed holds
```

A hold is not a completed debit. It identifies an owner, purpose, amount,
expiry policy, state, and external reference. Settlement and release are
one-time state transitions protected by a unique lock.

Deposit principal and JOESE asset values are not part of the available
transaction balance. A member must withdraw an eligible flexible deposit or
wait for a term deposit to mature before using that J$.

## 4. JOESE clearing flows

### Buy order

1. JOESE sends the member, order ID, maximum required cents, and idempotency key.
2. Joe Banking creates a hold only if sufficient available balance exists.
3. JOESE may open the order only after the hold is confirmed.
4. Each fill settles a portion of the hold to JOESE clearing.
5. Cancellation or completion releases any unused remainder.

### Sale settlement

1. JOESE completes its asset transfer and calculates exact proceeds and fees.
2. JOESE submits a one-time settlement credit using the trade ID.
3. Joe Banking posts the net proceeds from JOESE clearing to the member's
   transaction account.
4. A duplicate trade ID returns the original result without a second credit.

### Failure handling

No cross-service flow assumes that two databases share one transaction. Each
side records an operation state and an immutable external reference. A retrying
outbox completes interrupted calls, while a reconciliation job compares open
JOESE orders/trades with banking holds and settlements.

If the banking API is unavailable, JOESE may remain readable but must reject new
orders requiring a balance reservation. It must not fall back to a stale local
balance for writes.

## 5. Opening-balance migration

The existing JOESE J$10,000 opening balance and later ledger activity must not
be replayed as new money. Migration takes a consistent snapshot:

1. Temporarily pause JOESE balance-changing writes.
2. Reconcile every member's current disposable balance to its JOESE ledger.
3. Create the linked banking customer and transaction account.
4. Post one attributed migration opening entry for the reconciled balance.
5. Record the JOESE user ID, migration batch, source balance, and source ledger
   checkpoint.
6. Switch JOESE reads and writes to the banking integration.
7. Reconcile totals before reopening writes.

The JoeAuth transition later updates the identity link; it does not repost the
financial migration.

## 6. Corrections and account closure

Posted entries are never edited or deleted. An approved correction posts an
equal and opposite transaction linked to the original, followed by the intended
replacement when necessary. It includes a reason, operator, request ID, and
before/after reconciliation.

Closing a member account first resolves or freezes pending wires, holds,
deposits, loans, and JOESE activity. Historical ledger and contract records are
retained.

