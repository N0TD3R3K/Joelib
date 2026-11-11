# JOE Stock Exchange (JOESE) — Vision

## Purpose

JOE Stock Exchange (JOESE) is a closed, fictional market simulation for the
Joe Universe and its invited members. It gives the Joe team a shared way to
follow fictional listings, react to Joe Wire news, and make simulated trading
decisions in **Joellars (J$)**.

JOESE is entertainment and collaborative world-building. J$ has no cash value,
is not a cryptocurrency, and can never be deposited, withdrawn, exchanged, or
redeemed for real money, goods, services, or value outside JOESE.

## The product

JOESE has three connected surfaces:

1. **Member exchange** — the private site where verified members view markets,
   read Joe Wire bulletins, manage a simulated portfolio, and place trades.
2. **Market Operations Console** — the internal site where authorized operators
   prepare and schedule Joe Wire events, monitor market runs, investigate audit
   records, and manage members. It is not a price-control panel.
3. **The Joe Wire** — the shared public-in-product news identity. Its structured
   bulletins explain market-relevant fictional events before or when they affect
   official prices.

The proposed public addresses are `joese.derekli.dev` for the exchange,
`console.joese.derekli.dev` for the console, and `api.joese.derekli.dev` for
the shared API. They are deployment targets, not a requirement to register or
use them before the product is ready.

## Version 1 goals

- Give every verified member the same J$10,000 starting balance and a clear,
  understandable set of fictional assets.
- Run a predictable hourly market in the `America/New_York` time zone, with
  official updates from 2:00 PM through the 10:00 PM close.
- Let members buy and sell according to published bid, ask, fee, quantity, and
  market-lock rules.
- Make price movement legible: it comes from ordinary asset behavior, shared
  market mood, published Joe Wire events, and aggregate prior demand.
- Preserve a permanent, reviewable ledger of trades, fees, prices, balances,
  market updates, and operations activity.
- Make the Operations Console accountable: every market-relevant event is
  structured, scheduled, attributable, and visible to members.

## Version 1 boundaries

JOESE deliberately does **not** include:

- real-money payments, deposits, withdrawals, cash-outs, prizes, or conversion
  of J$ into anything of value;
- leverage, margin, loans, short selling, options, derivatives, or member-to-
  member transfers;
- instant price changes triggered by individual trades;
- hidden price overrides or unpublished market-moving operator actions;
- anonymous public trading accounts; or
- operator accounts that can both administer market events and trade.

Fictional listings reference Joe Universe themes and projects only. A listing
does not represent a real company, a security, ownership, endorsement, or a
claim about the person or project named by it.

## Product principles

### Fairness is visible

Members see the same official quote, the same published Joe Wire bulletin, and
the same trading rules. Trading pauses during an update, and an operator cannot
manually set a price.

### Simulation is explainable

The engine may contain bounded randomness and aggregate demand, but it records
the inputs and publishes a human-readable explanation for each official market
update. The system does not disclose a future percentage effect before the
relevant update.

### The ledger is the record

Balances and positions are consequences of an append-only record of events and
trades. A correction must be a separately attributed correction, never a
silent rewrite of history.

### Membership is intentional

JOESE is invitation-only. Registration, email verification, password handling,
and role boundaries are part of the product—not an afterthought.

### Lore supports, but does not bypass, the market

Joe Wire writing can be playful and creative. Its structured market fields,
schedule, audit history, and member visibility must remain precise enough to
protect the simulation's fairness.

## Definition of a successful first release

A small invited group can create and verify accounts, receive their starting
J$ balance, inspect the market and Joe Wire, trade eligible assets during an
open session, and later reconcile every displayed balance and price to recorded
trades, published events, and scheduled market updates. An operator can create
and schedule a bulletin but cannot use the console to secretly move a price or
trade the market.

## Decisions still required before implementation

- Exact trading-open and trading-close behavior outside the hourly update
  window, including weekends and holidays.
- Initial reference prices, drift/volatility profiles, and demand-normalization
  values for each asset.
- The production database, deployment topology, and backup/retention plan.
- The exact member-invitation issuance and approval workflow.
- Whether a daily integrity hash and post-close reveal of generated market
  conditions will ship in Version 1 or a later release.
