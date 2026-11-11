# JOESE market rules

## 1. Scope and terminology

JOESE is a closed fictional simulation. Its unit of account is the **Joellar**,
written `J$`. J$ is an internal accounting unit only; it is not a tradable
asset and has no real-world value or redemption path.

An **official price** is the most recently published reference price for an
asset. A member buys at the current **ask** and sells at the current **bid**.
The **market engine** produces the next official price only at a scheduled
market tick.

These rules apply to all Version 1 listings. The asset universe is maintained
in [assets-and-tickers.md](assets-and-tickers.md).

## 2. Member balances and permitted activity

- A verified member begins with **J$10,000.00**.
- Members may buy an asset only when their available J$ balance covers the
  order's cost and fee.
- Members may sell only quantities they already hold and have available to
  sell.
- Stock quantities are whole shares. Crypto-asset quantities may have up to
  two decimal places.
- JOESE has no leverage, margin, loans, short selling, options, derivatives,
  staking, member-to-member transfers, deposits, withdrawals, or cash-outs.
- An accepted trade executes against the current official bid or ask; it does
  not by itself change the displayed quote.

## 3. Market schedule and locks

JOESE uses `America/New_York` as the authoritative market time zone. The
market engine publishes an official update at 2:00 PM, 3:00 PM, 4:00 PM, 5:00
PM, 6:00 PM, 7:00 PM, 8:00 PM, 9:00 PM, and 10:00 PM. The 10:00 PM update is
the daily close.

The exchange pauses trading for a short, documented lock around each update.
During the lock it must reject new trades with a clear reason; it must never
accept a trade at an uncertain or partially updated price. The precise lock
duration is an implementation decision, but it must be consistent, visible in
the member experience, and recorded with each tick.

Trades entered during the final two minutes before a scheduled tick count only
toward the *following* eligible tick's demand calculation. This includes the
10:00 PM close: late trades affect the next scheduled trading update, not the
price currently being closed.

The trading-calendar policy for days without a normal session is pending. Until
it is specified, the production system must not improvise extra ticks or alter
the published schedule.

## 4. Quote, spread, and fee

The initial proposed Version 1 quote model is:

- a total bid-ask spread of **0.50%** around the official price; and
- an exchange fee of **0.25%** of the trade's gross value.

For an official price `P`, the proposed quote is:

```text
bid = P × (1 - 0.0025)
ask = P × (1 + 0.0025)
```

For quantity `Q`:

```text
buy gross = ask × Q
sell gross = bid × Q
fee       = gross × 0.0025
```

The member pays `buy gross + fee` for a purchase and receives `sell gross -
fee` for a sale. Rounding must be deterministic and preserved on the trade
record. Before launch, the team must specify the precision and rounding policy
for J$, stock quantities, and crypto quantities.

The spread and fee above are proposals from the product handoff, not hidden
engine parameters. Any change requires a versioned rule change, a member-facing
notice, and an audit record.

## 5. Trade lifecycle

1. The exchange checks that the market is open and not locked.
2. It fetches one current official quote and creates an idempotent trade intent.
3. It validates member status, role, quantity precision, available cash or
   holdings, and all asset-specific constraints.
4. It calculates the bid or ask, gross value, fee, and resulting balance.
5. It atomically records the executed trade and its ledger entries, then updates
   the member's available balance and position.
6. It confirms the completed trade with its exact price, fee, time, quantity,
   and resulting balance.

An invalid or rejected order does not create a trade. A completed trade is not
silently edited or deleted. Reversal or administrative correction, if ever
needed, must be a separately attributed ledger event linked to the original
trade.

## 6. Scheduled price updates

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

## 7. Demand and news fairness

The engine aggregates demand; it does not publish any member's individual
order, position, or influence. It may use net buying and selling volume to form
`D_i`, but the normalization, cap, and lookback window must be versioned before
launch and documented for audit.

Joe Wire events contribute only through their declared affected assets,
direction, severity, duration, and scheduled publication. An Operations Console
user cannot write a direct price, a percentage override, or an undisclosed
market-moving parameter. See [joe-wire-events.md](joe-wire-events.md).

## 8. Market integrity requirements

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
