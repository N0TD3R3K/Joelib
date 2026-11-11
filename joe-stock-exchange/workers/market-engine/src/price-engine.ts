import { calculateNextPrice } from "@joese/market-rules";

function seededFraction(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

export function deterministicMarketMood(tickKey: string): number {
  return (seededFraction(`mood:${tickKey}`) * 2 - 1) * 0.01;
}

export function ordinaryReturn(tickKey: string, ticker: string, drift: number, volatility: number): number {
  return drift + (seededFraction(`${tickKey}:${ticker}`) * 2 - 1) * volatility;
}

export { calculateNextPrice };

