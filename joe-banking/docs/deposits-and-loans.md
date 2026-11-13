# Deposits and loans

## 1. Meaning of a deposit

A Joe Banking deposit moves existing fictional J$ from the member's transaction
account into a savings product. It is not a deposit of real cash or outside
currency and does not create a real-world claim.

Deposit funding and withdrawal are internal balanced ledger transactions. J$
inside a deposit is not available for wires, JOESE orders, or loan repayments
until the product permits withdrawal or reaches maturity.

## 2. Flexible deposit

The flexible deposit is an at-will savings account:

- funded from available transaction-account J$;
- withdrawable back to the transaction account at any time;
- earns the current variable Joe Rate;
- accrues proportionally over time and posts weekly; and
- is not affected retroactively by a later rate change.

A funding or withdrawal event splits the interest accrual interval so interest
is calculated on the correct principal. A withdrawal cannot exceed posted
flexible-deposit balance. Accrued but not-yet-posted interest is displayed as an
estimate and cannot be spent until posted.

## 3. Fixed-term deposits

The initial term-deposit catalog is:

| Product | Term | Fixed weekly rate | Variable-rate changes |
| --- | ---: | ---: | --- |
| Short Joe Deposit | 2 weeks | 1.000% | Ignored |
| Standard Joe Deposit | 4 weeks | 1.500% | Ignored |
| Long Joe Deposit | 8 weeks | 2.250% | Ignored |

The product names are working names and may change without changing the contract
rules.

Before confirmation, the member sees principal, fixed weekly rate, start,
maturity, projected interest, compounding method, and the early-withdrawal rule.
The accepted contract stores those terms immutably.

The proposed first-version behavior is:

- principal is locked until maturity;
- interest compounds at each complete seven-day contract anniversary;
- partial weeks are prorated only when needed by a reviewed correction;
- at maturity, principal and posted interest automatically credit the member's
  transaction account exactly once; and
- there is no normal early withdrawal.

An exceptional administrator release must use a documented correction flow and
cannot silently rewrite the original contract. Early-withdrawal penalties are
not introduced until the owner approves an explicit rule.

## 4. Deposit creation and maturity

Creating a term deposit atomically debits the transaction account and credits
the term-deposit liability. The contract becomes active only if the member has
sufficient available balance and the idempotency key is unused.

The maturity engine uses one unique contract-and-maturity key. A retry returns
the original settlement rather than crediting the member twice. The contract
then remains as closed history.

## 5. Loan lifecycle

```text
application
  → under_review
  → offered
  ├── declined/withdrawn
  └── accepted → active → repaid/closed
                       └── delinquent (when repayment rules are approved)
```

1. An eligible member submits an amount and purpose note.
2. A banking operator reviews identity, current liabilities, available policy,
   and any disclosed eligibility classification.
3. The operator creates a specific offer containing amount, rate kind, weekly
   rate, term, payment schedule, and expiration.
4. The member accepts or declines the exact terms.
5. Acceptance creates the loan receivable and credits the member's transaction
   account atomically.
6. Interest accrues according to the accepted contract.
7. Repayments debit available transaction J$ and apply first to due interest,
   then principal, unless a future contract explicitly states otherwise.

An application alone never credits J$ or creates interest.

## 6. Variable and fixed loan rates

A variable-rate loan follows the Joe Rate for future accrual intervals. Every
rate change is visible in the loan's history and does not recalculate interest
already accrued.

A fixed-rate loan stores its accepted weekly rate and ignores every later Joe
Rate adjustment for the entire fixed period. An operator cannot edit an active
contract's rate. Refinancing, if introduced, creates a new accepted contract and
settles the prior one through explicit ledger entries.

Fixed-loan term and rate products have not yet been defined. The schema and API
support them, but the console must not offer a fixed loan until the owner
approves its catalog and eligibility rules.

## 7. Repayment and delinquency

Members may make a positive whole-cent repayment from available transaction J$.
A repayment cannot exceed the payoff amount unless the API atomically limits it
to the exact payoff and returns the unused amount.

The following loan policy still needs approval before implementation:

- minimum and maximum principal;
- permitted terms and fixed rates;
- weekly minimum-payment formula;
- first due date and grace period;
- treatment of unpaid accrued interest;
- delinquency stages and member notices;
- whether more than one active loan is permitted; and
- whether loan proceeds may fund JOESE purchases.

Until these are approved, designs may implement loan application and offer
records but must not invent production repayment or penalty terms. There are no
real-world collections, credit reporting, collateral seizure, or legal debt.

## 8. Disclosure and projections

Every rate is labeled **per week**, never annual percentage rate. A loan or
deposit page shows both the rate and a J$ projection using the current or fixed
contract assumptions. Variable projections clearly state that future Joe Rate
changes will change the result.

Displayed projections are informational. The append-only accrual and ledger
records determine the exact posted amount.

