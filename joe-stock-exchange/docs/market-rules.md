# JOESE market rules

## 1. Scope and terminology

JOESE is a closed fictional simulation. Its unit of account is the **Joellar**,
written `J$`. J$ is an internal accounting unit only; it is not a tradable
asset and has no real-world value or redemption path.

An **official price** is the most recently published reference price for an
asset. A member buys at the current **ask** and sells at the current **bid**.
The **market engine** produces the next official price only at a scheduled
market tick.

**Disposable balance** is the J$ a member can spend on an eligible purchase or
use to satisfy a due JOE Bank payment. A **portfolio asset** is a share or
crypto-asset holding. Portfolio assets have a market value but are not part of
the member's disposable balance and are not automatically redeemable by JOESE.

These rules apply to all Version 1 listings. The asset universe is maintained
in [assets-and-tickers.md](assets-and-tickers.md).

## 2. Member balances and permitted activity

- A verified member begins with **J$10,000.00 of disposable balance**, once per
  eligible account.
- Members may buy an asset only when their available J$ balance covers the
  order's cost and fee.
- Members may sell only quantities they already hold and have available to
  sell.
- Stock quantities are whole shares. Crypto-asset quantities may have up to
  two decimal places.
- JOESE has no leverage, margin, short selling, options, derivatives, staking,
  deposits, withdrawals, or cash-outs. A member-to-member J$ transaction is
  allowed only through the receiver-approved inbox flow below.
- A purchase moves disposable balance into a portfolio asset. It does not leave
  the buyer with that amount of disposable balance as well.
- A portfolio asset is converted back into disposable balance only when a buyer
  accepts it in a matched trade. JOESE is not an automatic redemption counterparty.
- A completed trade does not by itself change the displayed official quote.

### Joe Bank bankruptcy borrowing

Joe Bank is the only permitted lending route in Version 1. A member who has
been formally classified as bankrupt may request an internal J$ loan from Joe
Bank. The loan creates a recorded J$ liability and may provide disposable
balance; it is not real-world credit or a way to deposit or withdraw money.

Bankruptcy is an explicit operator classification with a required reason and
audit record. It is never inferred solely from disposable balance, portfolio
value, or a short-lived market move. Once classified, a member may submit one
open application at a time, up to the configured Joe Bank limit.

An operator may decline the application or offer a variable annual percentage
rate. The member sees the amount, rate, variable-rate disclosure, and decision
note and must accept those terms before any J$ is credited. An offered rate can
be revised only through another audited action; accepting and revising the same
version cannot both succeed.

For an active loan, the 10:00 PM New York close adds one day of interest using
the outstanding liability and variable APR then in effect:

```text
daily interest = round(outstanding liability × APR / 365)
```

The interest is capitalized into the outstanding simulated liability and is
recorded once per loan and market date. A member may make a partial or full
repayment from disposable J$ at any time. Version 1 has no automatic payment,
real-world collection, or automatic default action. Disbursement, rate changes,
interest, repayments, and classification changes are all preserved in the
ledger or audit history. The production defaults are a J$10,000 application
limit, an 8.00% suggested APR, and a 50.00% maximum APR; operators can change
those deployment settings without changing code.

## 3. Market schedule and locks

JOESE uses `America/New_York` as the authoritative market time zone. The
market engine publishes an official update at 2:00 PM, 3:00 PM, 4:00 PM, 5:00
PM, 6:00 PM, 7:00 PM, 8:00 PM, 9:00 PM, and 10:00 PM. The 10:00 PM update is
the daily close.

The exchange pauses trading for two minutes before and two minutes after each
update. During the lock it rejects new orders with a clear reason; it never
accepts an order at an uncertain or partially updated price.

Trades entered during the final two minutes before a scheduled tick count only
toward the *following* eligible tick's demand calculation. This includes the
10:00 PM close: late trades affect the next scheduled trading update, not the
price currently being closed.

Version 1 uses this schedule every calendar day, including weekends and school
holidays. Any future holiday calendar is a versioned rule change.

## 4. Quote, spread, and fee

The initial proposed Version 1 quote model is:

- a total bid-ask spread of **0.50%** around the official price; and
- an exchange fee of **0.25%** of the trade's gross value.

For an official price `P`, the proposed quote is:

```text
bid = P × (1 - 0.0025)
ask = P × (1 + 0.0025)
```

For quantity `Q`, the default order limits are:

```text
buy gross = ask × Q
sell gross = bid × Q
fee       = gross × 0.0025
```

The member pays `buy gross + fee` for a completed purchase and receives `sell
gross - fee` for a completed sale. Compatible orders match when the buyer's
limit is at least the seller's limit. The trade stores the buyer settlement
price, seller settlement price, and resulting spread separately. A displayed
bid or ask is not a promise that JOESE itself will buy or sell the asset. A sale
completes only when a qualifying buyer is willing to take the offered remaining
assets; likewise, a purchase requires available seller assets.

J$ is stored and rounded to whole cents using half-up JavaScript integer
rounding. Stocks trade in whole shares. Crypto-assets trade in increments of
0.01 units. The gross value and each side's fee are rounded independently and
preserved on the trade and ledger records.

The spread and fee above are proposals from the product handoff, not hidden
engine parameters. Any change requires a versioned rule change, a member-facing
notice, and an audit record.

## 5. Trade lifecycle

1. The exchange checks that the market is open and not locked.
2. It creates an idempotent buy or sell intent tied to the current official
   price and the member's stated quantity.
3. It validates member status, role, quantity precision, available disposable
   balance or available holdings, and all asset-specific constraints.
4. It reserves the buyer's disposable J$ or the seller's assets while the order
   is eligible for matching.
5. It matches only compatible buyer and seller orders. An unmatched sell order
   remains an asset holding; it cannot be liquidated automatically into J$.
6. On a fill, it calculates the buyer and seller settlement prices, gross
   values, fees, spread, and resulting balances, then atomically records the
   trade and its ledger entries.
7. It confirms the completed or open order with its exact settlement values,
   fees, time, quantity, and resulting balance or holding.

An invalid or rejected order does not create a trade. A completed trade is not
silently edited or deleted. Reversal or administrative correction, if ever
needed, must be a separately attributed ledger event linked to the original
trade. Cancelling an unmatched order releases its reserved J$ or assets without
changing the member's completed-trade history.

The one-way issuance account is an eligible seller of the finite public float.
It is suspended from interactive login, cannot submit member orders, and never
acts as a buyer. Member sell orders at a compatible lower limit receive price
priority over issuance inventory.

## 6. Company launch, shareholder assets, and delisting

When a developer releases a new project, the developer may make that project a
fictional public company and request a new stock listing. The developer is
recorded as the listing's main shareholder. Before the listing can open, its
shareholders must together convert at least **J$5,000** into shareholder assets
of that listing.

Those shareholder assets are portfolio holdings, not disposable balance. They
cannot be freely turned back into J$ merely because a shareholder wants to exit;
the shareholder must sell to an eligible buyer through the exchange's matching
process. The launch record must identify the developer, shareholders, combined
minimum contribution, initial share allocation, and the listing's audit trail.

A stock listing is removed if its official daily closing price remains **below
J$1.00 per share for three consecutive market days**. A close at J$1.00 or more
resets the consecutive-day count. When removal is triggered:

- the listing becomes inactive and any open orders for it are cancelled;
- all remaining holdings of that listing are valued at **J$0.00**;
- no automatic buyback, compensation, or conversion to disposable balance is
  made; and
- its historical prices, ownership, trades, and removal record remain auditable.

This rule applies to stock listings. A separate documented rule is required
before applying an equivalent delisting mechanism to crypto-assets.

### Receiver-approved J$ transactions

A sender may propose a J$ transaction to one named account. JOESE immediately
reserves the proposed amount from the sender's disposable balance, then places
the transaction in the receiver's inbox. The J$ reaches the receiver only after
the receiver chooses **Receive**. Declining the transaction returns the full
reserved amount to the sender. Every state change is a ledger event.

### Seller-initiated frozen-share offers

Only the current shareholder may initiate an offer for frozen shareholding
assets. The seller names the buyer, quantity, and total asking price. The named
buyer may accept or decline the inbox offer but cannot submit a purchase request
for another member's frozen assets. Offered shares stay reserved until the offer
is accepted, declined, or cancelled.

## 7. Scheduled price updates

Prices change only on scheduled ticks. At each tick, for asset `i`, the market
engine calculates a bounded return:

```text
r_i = clamp(B_i + M + N_i + D_i, -C_i, +C_i)
```

Where:

- `B_i` is the asset's ordinary drift and volatility personality;
- `M` is the shared Joe Universe market mood;
- `N_i` is the net impact of active, published Joe Wire events; and
- `D_i` is aggregate net member buy/sell demand from the prior eligible demand
  window.

`C_i` is a hard hourly cap. The suggested limits are:

| Asset type | Typical hourly behavior | Hard hourly cap | Daily cap |
| --- | --- | --- | --- |
| Stock | ±1–4% | ±12% | ±35% |
| Crypto-asset | ±3–9% | ±25% | ±60% |

The daily cap applies in addition to the hourly cap. If the calculated move
would cross either boundary, the engine clamps it and records that fact in the
official price explanation.

The next official price is based on the current official price and the bounded
return. The update must run once only for each asset and market tick, even if a
scheduled job is retried. Each run records its inputs, applied caps, output,
engine version, and timestamp.

## 8. Demand and news fairness

The engine aggregates demand; it does not publish any member's individual
order, position, or influence. It may use net buying and selling volume to form
`D_i`, but the normalization, cap, and lookback window must be versioned before
launch and documented for audit.

Joe Wire events contribute only through their declared affected assets,
direction, severity, duration, and scheduled publication. An Operations Console
user cannot write a direct price, a percentage override, or an undisclosed
market-moving parameter. See [joe-wire-events.md](joe-wire-events.md).

## 9. Market integrity requirements

- Operators and administrators cannot trade while they hold a market-operations
  role.
- Every member receives the same official quote for a given completed tick.
- Every market-relevant event is simultaneously visible to members when it is
  published.
- Trade, ledger, quote, event, and operator-audit records are retained as a
  permanent historical record.
- Manual intervention must be explicit, limited to a documented recovery or
  correction process, and visible in the audit history.

An optional daily integrity hash may commit the day's generated market inputs
before opening. If adopted, the underlying generated conditions are revealed
after close so members can independently inspect the simulation.
