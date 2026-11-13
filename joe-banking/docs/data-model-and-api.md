# Data model and API

## 1. Data-model principles

- Use opaque string IDs; never use email as a financial primary key.
- Store money as integer cents and rates as integer ppm.
- Store UTC timestamps and derive New York business-period keys explicitly.
- Keep financial postings, rate history, contracts, and audit events
  append-only.
- Use unique business references and state-transition locks for every operation
  that can be retried or resolved concurrently.
- Treat displayed balances as projections of the ledger, not independent facts.

## 2. Proposed core tables

### Identity and accounts

`bank_customers`

- `id`
- `joe_auth_user_id` — unique and nullable only during controlled migration
- `status` — pending, active, suspended, closed
- `created_at`, `updated_at`

`legacy_identity_links`

- `bank_customer_id`
- `system` — initially `joese`
- `external_user_id`
- `linked_at`, `migration_batch_id`
- unique `(system, external_user_id)` and unique current JOESE link per customer

`bank_accounts`

- `id`, `customer_id`
- `account_kind` — transaction, flexible_deposit, internal_clearing
- `currency` — fixed to `J$`
- `status`, `created_at`, `closed_at`

JoeAuth name and email should normally be fetched through a scoped identity
profile or stored as a short-lived display cache. Historical financial records
retain the immutable JoeAuth subject ID, not a copied email as ownership proof.

### Ledger and holds

`ledger_transactions`

- `id`, `transaction_type`
- `business_reference_type`, `business_reference_id`
- `idempotency_key`, `description`
- `effective_at`, `created_at`, `reversal_of_id`
- unique business reference and unique applicable idempotency key

`ledger_lines`

- `id`, `ledger_transaction_id`, `ledger_account_id`
- signed `amount_cents`
- optional `customer_id`, `product_type`, `product_id`
- lines for one transaction must sum to zero

`balance_projections`

- cached posted balance per ledger account
- version/checkpoint and update timestamp
- rebuilt and verified against ledger lines

`fund_holds`

- `id`, `customer_id`, `bank_account_id`
- `purpose` — member_wire or joese_order
- `amount_cents`, `remaining_cents`
- `external_reference`, `status`
- `created_at`, `released_at`, `settled_at`

### Member wires

`member_wires`

- `id`, `sender_customer_id`, `receiver_customer_id`
- `amount_cents`, `memo`, `hold_id`
- `status`, `created_at`, `resolved_at`, `resolved_by`
- immutable settlement/release ledger transaction reference

### Interest policy

`rate_policies`

- current `weekly_rate_ppm`
- `version`, `effective_at`
- minimum/maximum and adjustment limits as versioned policy fields

`rate_adjustments`

- `id`, `prior_rate_ppm`, `new_rate_ppm`, `delta_ppm`
- `business_week_key`, `week_sequence`
- `reason_category`, `public_explanation`, `internal_note`
- optional `news_event_id`
- `actor_id`, `effective_at`, `created_at`
- unique `(business_week_key, week_sequence)` with sequence limited to 1 or 2

### Deposits and interest

`term_deposit_contracts`

- `id`, `customer_id`, funding and payout account IDs
- `principal_cents`, `term_weeks`, `fixed_weekly_rate_ppm`
- `started_at`, `matures_at`, `status`
- accepted terms/version and maturity ledger reference

`interest_accruals`

- product type and product ID
- interval start/end, principal basis, rate ppm
- accrued microcents and carried remainder
- policy/contract version and unique interval key

`interest_postings`

- product and period key
- posted cents, carried remainder, ledger transaction ID
- unique product-and-period constraint

### Loans

`loan_applications`

- `id`, `customer_id`, requested amount, member note
- status, review fields, requested/decided times

`loan_offers`

- application ID, offered principal
- rate kind, weekly rate ppm, term weeks
- repayment-plan JSON only for versioned disclosed terms
- offer expiration, operator, status, accepted terms version

`loan_contracts`

- `id`, accepted offer ID, customer ID
- original and outstanding principal
- rate kind and fixed rate or variable-policy reference
- accrued interest cents/remainder
- start, maturity, next due, status, version

`loan_payments`

- contract ID, amount, interest portion, principal portion
- ledger transaction ID, idempotency key, created time

### Reliability and audit

`state_transition_locks`, `idempotency_records`, `service_outbox`,
`service_inbox`, `scheduled_job_runs`, and `audit_log` provide one-time state
changes, safe API retries, cross-service delivery, job replay protection, and
operator attribution.

## 3. Member API outline

All paths are illustrative and remain versioned under `/v1`.

### Account and rate

- `GET /me/summary`
- `GET /me/activity`
- `GET /rates/current`
- `GET /rates/history`

### Wires

- `POST /wires` — sender creates a receiver-approved wire
- `GET /wires`
- `GET /me/inbox`
- `POST /wires/{id}/accept`
- `POST /wires/{id}/decline`
- `POST /wires/{id}/cancel`

There is intentionally no payment-request endpoint.

### Deposits

- `GET /deposits`
- `POST /deposits/flexible/fund`
- `POST /deposits/flexible/withdraw`
- `POST /deposits/term`
- `GET /deposits/term/{id}`

### Loans

- `GET /loans`
- `POST /loan-applications`
- `POST /loan-applications/{id}/withdraw`
- `POST /loan-offers/{id}/accept`
- `POST /loan-offers/{id}/decline`
- `POST /loans/{id}/repay`

Every member write requires an authenticated JoeAuth-linked member session and
an `Idempotency-Key` header.

## 4. Console API outline

- `GET /console/overview`
- `GET /console/rates`
- `POST /console/rates/adjustments`
- `GET /console/loan-applications`
- `POST /console/loan-applications/{id}/offer`
- `POST /console/loan-applications/{id}/decline`
- `GET /console/wires`
- `POST /console/accounts/{id}/freeze`
- `POST /console/corrections`
- `GET /console/reconciliation`
- `GET /console/audit`

Console writes require a banking-specific server-side entitlement and create an
audit record. No API accepts an arbitrary replacement balance.

## 5. JOESE internal API outline

These endpoints are service-to-service only and are never exposed to a member
browser:

- `POST /internal/joese/holds`
- `POST /internal/joese/holds/{id}/settlements`
- `POST /internal/joese/holds/{id}/release`
- `POST /internal/joese/sale-credits`
- `GET /internal/joese/reconciliation?checkpoint=...`

Each request includes JOESE's immutable order/trade reference, member JoeAuth
subject or mapped bank customer, exact cents, idempotency key, and authenticated
service identity. The API validates that the supplied customer is the owner of
the referenced product membership.

## 6. Response and error behavior

Financial responses include exact integer cents, display currency, operation
ID, committed state, and timestamps. Common conflicts distinguish insufficient
available balance, stale state, duplicate-but-different idempotency use,
ineligible product, expired offer, rate-policy limit, and service reconciliation
lock.

Errors must not expose another member's existence, balance, email, contract, or
internal ledger account.

