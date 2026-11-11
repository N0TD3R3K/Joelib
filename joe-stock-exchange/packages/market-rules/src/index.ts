export interface Quote {
  bidCents: number;
  askCents: number;
}

export interface PriceInputs {
  currentPriceCents: number;
  openingPriceCents: number;
  ordinaryReturn: number;
  marketMood: number;
  newsImpact: number;
  demandPressure: number;
  hourlyCap: number;
  dailyCap: number;
}

export interface PriceResult {
  nextPriceCents: number;
  rawReturn: number;
  appliedReturn: number;
  hourlyClamped: boolean;
  dailyClamped: boolean;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function roundMoney(value: number): number {
  return Math.round(value);
}

export function quoteForPrice(priceCents: number, totalSpread = 0.005): Quote {
  const halfSpread = totalSpread / 2;
  return {
    bidCents: Math.max(1, roundMoney(priceCents * (1 - halfSpread))),
    askCents: Math.max(1, roundMoney(priceCents * (1 + halfSpread))),
  };
}

export function feeForGross(grossCents: number, feeRate = 0.0025): number {
  return Math.max(0, roundMoney(grossCents * feeRate));
}

export function calculateNextPrice(inputs: PriceInputs): PriceResult {
  const rawReturn =
    inputs.ordinaryReturn +
    inputs.marketMood +
    inputs.newsImpact +
    inputs.demandPressure;
  const hourlyReturn = clamp(rawReturn, -inputs.hourlyCap, inputs.hourlyCap);
  const hourlyPrice = Math.max(1, roundMoney(inputs.currentPriceCents * (1 + hourlyReturn)));
  const lowerDailyPrice = roundMoney(inputs.openingPriceCents * (1 - inputs.dailyCap));
  const upperDailyPrice = roundMoney(inputs.openingPriceCents * (1 + inputs.dailyCap));
  const nextPriceCents = clamp(hourlyPrice, Math.max(1, lowerDailyPrice), Math.max(1, upperDailyPrice));
  return {
    nextPriceCents,
    rawReturn,
    appliedReturn: nextPriceCents / inputs.currentPriceCents - 1,
    hourlyClamped: rawReturn !== hourlyReturn,
    dailyClamped: nextPriceCents !== hourlyPrice,
  };
}

export function newYorkMarketParts(date: Date): { dateKey: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    dateKey: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export function isScheduledMarketTick(date: Date): boolean {
  const { hour, minute } = newYorkMarketParts(date);
  return minute === 0 && hour >= 14 && hour <= 22;
}

export type MarketTradingStatus = "open" | "locked" | "closed";

/**
 * Version 1 trades every calendar day. Each hourly tick is protected by a
 * two-minute lock on either side, and the 10 PM tick closes the session.
 */
export function marketTradingStatus(date: Date): MarketTradingStatus {
  const { hour, minute } = newYorkMarketParts(date);
  if (hour === 13 && minute >= 58) return "locked";
  if (hour >= 14 && hour <= 21) {
    return minute < 2 || minute >= 58 ? "locked" : "open";
  }
  if (hour === 22 && minute < 2) return "locked";
  return "closed";
}

export function nextScheduledMarketTick(date: Date): Date {
  const hourMs = 3_600_000;
  let candidate = new Date(Math.floor(date.getTime() / hourMs) * hourMs + hourMs);
  for (let index = 0; index < 72; index += 1) {
    if (isScheduledMarketTick(candidate)) return candidate;
    candidate = new Date(candidate.getTime() + hourMs);
  }
  throw new Error("Unable to locate the next JOESE market tick.");
}

export function isStockQuantityValid(quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0;
}

export function isCryptoQuantityValid(quantity: number): boolean {
  return Number.isFinite(quantity) && quantity > 0 && Math.round(quantity * 100) === quantity * 100;
}

export function grossForTrade(priceCents: number, quantity: number): number {
  return roundMoney(priceCents * quantity);
}

export function reserveForBuy(limitPriceCents: number, quantity: number): number {
  const grossCents = grossForTrade(limitPriceCents, quantity);
  return grossCents + feeForGross(grossCents);
}

export function dailyLoanInterestCents(outstandingCents: number, annualRateBps: number): number {
  if (!Number.isSafeInteger(outstandingCents) || outstandingCents < 0) {
    throw new RangeError("Outstanding liability must be a non-negative whole number of cents.");
  }
  if (!Number.isSafeInteger(annualRateBps) || annualRateBps < 0) {
    throw new RangeError("Annual rate must be a non-negative whole number of basis points.");
  }
  return Math.max(0, roundMoney((outstandingCents * annualRateBps) / 10_000 / 365));
}

export function nextBelowOneCloseCount(
  currentCount: number,
  closingPriceCents: number,
): number {
  return closingPriceCents < 100 ? currentCount + 1 : 0;
}

export function shouldDelistStock(belowOneCloseCount: number): boolean {
  return belowOneCloseCount >= 3;
}

