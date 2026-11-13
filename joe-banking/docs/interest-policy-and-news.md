# Interest policy and news

## 1. The variable Joe Rate

Joe Banking publishes one variable base rate, the **Joe Rate**, quoted as a
percentage per week. It applies prospectively to flexible deposits and
variable-rate loans. Fixed-term deposits and fixed-rate loans retain the rate
accepted in their contracts.

| Rule | Value |
| --- | ---: |
| Minimum weekly rate | 0.300% |
| Maximum weekly rate | 2.000% |
| Maximum adjustments per New York calendar week | 2 |
| Minimum absolute adjustment | 0.005 percentage points |
| Maximum absolute adjustment | 0.200 percentage points |

“0.200% adjustment” is interpreted as **0.200 percentage points**, not a 20%
relative change. For example, 1.000% may move to 1.200%, but not to 1.250% in
one adjustment. A move from 1.000% to 1.004% is too small.

The initial Joe Rate is not yet confirmed. The proposed default is 1.000% per
week.

## 2. Durable rate units

Rates are stored as integer parts per million of principal:

| Displayed rate | Stored `weekly_rate_ppm` |
| --- | ---: |
| 0.300% | 3,000 |
| 1.000% | 10,000 |
| 2.000% | 20,000 |
| 2.250% | 22,500 |

The variable-rate bounds are 3,000–20,000 ppm. A permitted adjustment is
50–2,000 ppm in absolute value. This representation supports the exact 0.005
percentage-point minimum without floating-point comparisons.

## 3. Console adjustment flow

Only a banking administrator or a separately granted rate-policy role may
submit an adjustment. The API, not the browser, enforces every limit.

An adjustment requires:

- direction and exact new rate;
- reason category: `news_event` or `normal_fluctuation`;
- a member-visible explanation;
- an internal operator note;
- an optional published news-event ID when news-driven; and
- a preview of affected variable products and effective time.

The change is rejected when:

- the resulting rate is below 0.300% or above 2.000%;
- the absolute movement is below 0.005 or above 0.200 percentage points;
- two successful adjustments already exist in that New York calendar week;
- the supplied current policy version is stale; or
- the actor lacks the server-side entitlement.

Each successful adjustment receives a unique week key and sequence number. A
database constraint and state-transition lock protect the twice-per-week rule
against simultaneous console submissions.

There is no silent undo. A reversal is another adjustment, consumes one of the
week's two changes, and must independently satisfy the movement and range rules.

## 4. Effective time and history

A rate change is never retroactive. It becomes effective at the recorded UTC
timestamp after the transaction commits. Accrual intervals before that instant
use the prior rate; intervals after it use the new rate.

Members can view:

- current weekly rate;
- minimum and maximum policy bounds;
- last change, direction, and effective time;
- member-visible explanation and related published news;
- the full historical rate chart; and
- a reminder that fixed contracts do not change.

## 5. Accrual calculation

The quoted weekly rate is prorated over elapsed time. For a constant principal
and rate segment:

```text
interest_cents
  = principal_cents
  × weekly_rate_ppm / 1,000,000
  × elapsed_seconds / 604,800
```

Implementation keeps the numerator or an equivalent fixed-point microcent
remainder until posting. It must not round every small interval independently.
The engine splits an accrual period at rate changes, principal changes,
repayments, withdrawals, maturity, and contract boundaries.

Interest is accrued by an idempotent scheduled job and posted weekly. Term
deposits additionally post or settle at their contract anniversaries and
maturity. Each posting has a unique product-and-period key, so a retry cannot
pay or charge the same interest twice.

## 6. News relationship

News can explain or motivate a rate adjustment, but news text does not directly
write a rate. A rate-policy actor still submits a bounded adjustment through the
console, and members see the resulting rate bulletin.

A banking rate event may be published to the shared Joe Universe news feed.
JOESE must not secretly read the bank rate and alter stock prices. If the same
event affects markets, it must enter JOESE through a separately published,
structured Joe Wire event and remain subject to JOESE caps and audit rules.

This separation prevents one console action from invisibly changing both loan
interest and stock prices.

## 7. Operational safety

- Scheduled accrual and posting use stable period keys and are safe to retry.
- A delayed job catches up from the last completed checkpoint rather than
  applying the current rate to the entire missed period.
- Rate history is append-only.
- Manual interest corrections use attributed reversing ledger entries.
- Console previews are estimates; committed ledger calculations are canonical.
- Monitoring alerts on a missed posting, unbalanced transaction, out-of-range
  rate, third weekly adjustment attempt, or reconciliation difference.

