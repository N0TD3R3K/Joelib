import { describe, expect, it } from "vitest";
import {
  calculateNextPrice,
  grossForTrade,
  isCryptoQuantityValid,
  isScheduledMarketTick,
  marketTradingStatus,
  nextBelowOneCloseCount,
  nextScheduledMarketTick,
  quoteForPrice,
  reserveForBuy,
  shouldDelistStock,
} from "@joese/market-rules";

describe("JOESE market rules", () => {
  it("builds a symmetric 0.5% quote", () => {
    expect(quoteForPrice(10_000)).toEqual({ bidCents: 9_975, askCents: 10_025 });
  });

  it("applies hourly and daily movement caps", () => {
    const result = calculateNextPrice({
      currentPriceCents: 10_000,
      openingPriceCents: 10_000,
      ordinaryReturn: 0.2,
      marketMood: 0.1,
      newsImpact: 0,
      demandPressure: 0,
      hourlyCap: 0.12,
      dailyCap: 0.1,
    });
    expect(result.nextPriceCents).toBe(11_000);
    expect(result.hourlyClamped).toBe(true);
    expect(result.dailyClamped).toBe(true);
  });

  it("uses America/New_York for the hourly market window", () => {
    expect(isScheduledMarketTick(new Date("2026-11-11T19:00:00.000Z"))).toBe(true);
    expect(isScheduledMarketTick(new Date("2026-11-11T18:30:00.000Z"))).toBe(false);
  });

  it("delists after three consecutive sub-J$1 closes", () => {
    let count = nextBelowOneCloseCount(0, 99);
    count = nextBelowOneCloseCount(count, 75);
    count = nextBelowOneCloseCount(count, 50);
    expect(shouldDelistStock(count)).toBe(true);
    expect(nextBelowOneCloseCount(count, 100)).toBe(0);
  });

  it("allows crypto quantities to two decimal places", () => {
    expect(isCryptoQuantityValid(1.25)).toBe(true);
    expect(isCryptoQuantityValid(1.234)).toBe(false);
  });

  it("locks around hourly ticks and closes after the daily close", () => {
    expect(marketTradingStatus(new Date("2026-11-11T19:30:00Z"))).toBe("open");
    expect(marketTradingStatus(new Date("2026-11-11T19:59:00Z"))).toBe("locked");
    expect(marketTradingStatus(new Date("2026-11-12T03:03:00Z"))).toBe("closed");
    expect(nextScheduledMarketTick(new Date("2026-11-12T03:03:00Z")).toISOString()).toBe("2026-11-12T19:00:00.000Z");
  });

  it("rounds trade values and reserves the buy-side fee", () => {
    expect(grossForTrade(1_025, 3)).toBe(3_075);
    expect(reserveForBuy(1_025, 3)).toBe(3_083);
  });
});

