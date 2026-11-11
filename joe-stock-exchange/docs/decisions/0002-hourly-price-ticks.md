# ADR 0002: Hourly price ticks

- **Status:** Accepted
- **Date:** 2026-11-11

## Decision

Official prices change only on hourly ticks from 2:00 PM through the 10:00 PM
close in `America/New_York`. Cloudflare invokes the engine every UTC hour; the
engine checks New York local time at runtime so daylight-saving changes do not
shift the market window.

Each tick has a unique market-time key. The engine records its ordinary return,
shared mood, active Joe Wire effects, demand pressure, applied caps, output, and
engine result. A duplicate invocation returns without applying a second update.
All listing-price writes, history points, issuance-quote updates, delisting
releases, and the tick's completion marker commit in one D1 batch. A failed or
stale-running tick can therefore retry without leaving a partially advanced
market.

## Consequences

Trades and news affect the next eligible tick rather than silently moving the
displayed quote. Trading is locked for two minutes on each side of the run, and
every member sees one official result. The application explains that the
display is a scheduled simulation rather than a continuous real-world market.

