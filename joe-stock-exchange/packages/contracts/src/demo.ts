import type {
  Asset,
  Holding,
  JoeBankSnapshot,
  MarketComment,
  MarketSnapshot,
  NewsEvent,
  PortfolioSnapshot,
  PricePoint,
} from "./index";

const now = new Date();

const assetSeed: Array<
  [string, string, "stock" | "crypto", number, number, string, string]
> = [
  ["JOE", "Joe Himself", "stock", 8425, 2.44, "The central figure and broad cultural anchor of the Joe Universe.", "Joe himself remains the market's most recognized fictional institution."],
  ["JAI", "Chat JoePT", "stock", 4872, 5.18, "Generative intelligence and assistant research for the Joe Universe.", "Chat JoePT develops fictional intelligence tools, research systems, and conversational products."],
  ["JLG", "Joeglish Literature Group", "stock", 3268, -1.21, "Joeglish literature, grammar, and translation research.", "JLG coordinates language research and the translation of major works into Joeglish."],
  ["JCT", "Joe Computer Tech", "stock", 6190, 3.76, "JoeLang and the computing systems of the Joe Universe.", "JCT maintains JoeLang, developer tools, and experimental Joe computing projects."],
  ["JEI", "Joelement Industries", "stock", 2754, 0.86, "Chemistry research centered on Joelements.", "JEI studies the Joeriodic Table and builds fictional materials research around Joelements."],
  ["JKR", "Joekemon Research", "stock", 2196, -2.35, "Research and development concerning Joekemons.", "JKR catalogs Joekemons and supports fictional field, habitat, and development studies."],
  ["JUV", "Joe Universe", "stock", 10942, 1.92, "The stability, reach, and development of the Joe Universe.", "JUV is a broad fictional listing linked to the health and popularity of the entire Joe Universe."],
  ["JTCN", "JoetCoin", "crypto", 1289, 7.42, "The main fictional crypto-asset of the Joe Universe.", "JoetCoin is a high-volatility simulation asset and is never redeemable outside JOESE."],
  ["LINK", "MrLink", "crypto", 935, -3.12, "A Joebotics-coach-inspired fictional crypto-asset.", "LINK responds to Joebotics progress in the fictional JOESE market only."],
  ["NTDK", "NotDerek", "crypto", 1744, 4.33, "A developer-inspired fictional crypto-asset.", "NTDK reflects fictional development activity around Joelib, JoeLang, and JOESE."],
  ["JOBO", "Joebotics Team", "crypto", 1120, 8.94, "The fictional market outlook of the Joebotics team.", "JOBO reacts to fictional robotics progress, competitions, and team milestones."],
  ["CORN", "CornCoin", "crypto", 408, -6.24, "A meme-inspired crypto-asset from the Joe and robotics teams.", "CornCoin is intentionally playful and among JOESE's most volatile assets."],
];

function isoHoursAgo(hours: number): string {
  return new Date(now.getTime() - hours * 3_600_000).toISOString();
}

function historyFor(assetId: string, current: number, change: number): PricePoint[] {
  const start = current / (1 + change / 100);
  return Array.from({ length: 17 }, (_, index) => {
    const progress = index / 16;
    const wave = Math.sin(index * 1.4) * current * 0.008;
    return {
      assetId,
      priceCents: Math.max(1, Math.round(start + (current - start) * progress + wave)),
      recordedAt: isoHoursAgo(16 - index),
    };
  });
}

export const demoAssets: Asset[] = assetSeed.map(
  ([ticker, name, type, currentPriceCents, percentChange, description, overview], index) => {
    const previousCloseCents = Math.round(currentPriceCents / (1 + percentChange / 100));
    const openPriceCents = Math.round(previousCloseCents * (1 + percentChange / 300));
    return {
      id: `asset-${ticker.toLowerCase()}`,
      ticker,
      name,
      type,
      description,
      companyDetails: {
        overview,
        developer: ticker === "JCT" || ticker === "NTDK" ? "Derek Li" : "Joe Team",
        founded: `202${(index % 5) + 2}`,
        headquarters: "Joe Universe",
        focus: type === "stock" ? ["Research", "Community", "Development"] : ["Culture", "Community"],
      },
      currentPriceCents,
      openPriceCents,
      highPriceCents: Math.round(Math.max(currentPriceCents, openPriceCents) * 1.018),
      lowPriceCents: Math.round(Math.min(currentPriceCents, openPriceCents) * 0.982),
      closePriceCents: previousCloseCents,
      previousCloseCents,
      percentChange,
      active: true,
      updatedAt: now.toISOString(),
    };
  },
);

export const demoNews: NewsEvent[] = [
  {
    id: "news-1",
    headline: "Chat JoePT research desk publishes a new reasoning model",
    article: "The Joe Wire confirms a major fictional research release, increasing interest in JAI and adjacent Joe technology listings.",
    category: "launch",
    direction: "bullish",
    severity: "major",
    affectedTickers: ["JAI", "JCT"],
    publishedAt: isoHoursAgo(2),
    authorName: "The Joe Wire",
    status: "published",
  },
  {
    id: "news-2",
    headline: "Joeglish archive begins a complete grammar review",
    article: "A new literature working group will review the core Joeglish archive over the next three market ticks.",
    category: "research result",
    direction: "mixed",
    severity: "moderate",
    affectedTickers: ["JLG"],
    publishedAt: isoHoursAgo(7),
    authorName: "The Joe Wire",
    status: "published",
  },
];

export const demoComments: MarketComment[] = [
  { id: "comment-1", assetTicker: "JAI", authorName: "joetrader", body: "The new research release makes the next hourly tick interesting.", createdAt: isoHoursAgo(1), status: "visible" },
  { id: "comment-2", assetTicker: "JAI", authorName: "cornwatch", body: "Watching whether demand carries over after the update lock.", createdAt: isoHoursAgo(0.4), status: "visible" },
];

const demoHoldings: Holding[] = [
  { id: "h1", assetId: "asset-jct", ticker: "JCT", name: "Joe Computer Tech", kind: "shareholding", quantity: 28, frozenQuantity: 28, averageCostCents: 5100, currentPriceCents: 6190, marketValueCents: 173320, percentChange: 21.37 },
  { id: "h2", assetId: "asset-jai", ticker: "JAI", name: "Chat JoePT", kind: "stock", quantity: 12, frozenQuantity: 0, averageCostCents: 4320, currentPriceCents: 4872, marketValueCents: 58464, percentChange: 12.78 },
  { id: "h3", assetId: "asset-jei", ticker: "JEI", name: "Joelement Industries", kind: "stock", quantity: 9, frozenQuantity: 0, averageCostCents: 2860, currentPriceCents: 2754, marketValueCents: 24786, percentChange: -3.71 },
  { id: "h4", assetId: "asset-jtcn", ticker: "JTCN", name: "JoetCoin", kind: "crypto", quantity: 42.5, frozenQuantity: 0, averageCostCents: 1050, currentPriceCents: 1289, marketValueCents: 54783, percentChange: 22.76 },
];

export function createDemoMarketSnapshot(): MarketSnapshot {
  return {
    assets: demoAssets,
    priceHistory: Object.fromEntries(
      demoAssets.map((asset) => [asset.ticker, historyFor(asset.id, asset.currentPriceCents, asset.percentChange)]),
    ),
    news: demoNews,
    comments: demoComments,
    marketStatus: "open",
    nextTickAt: new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000).toISOString(),
  };
}

export function createDemoPortfolioSnapshot(): PortfolioSnapshot {
  return {
    summary: {
      id: "demo-user",
      username: "joe.investor",
      email: "investor@school.example",
      role: "member",
      disposableBalanceCents: 623_447,
      frozenAssetValueCents: 173_320,
      assetValueCents: 138_033,
      borrowedCents: 75_000,
      preferences: { growthColor: "#38d39f", fallColor: "#ff6577", compactNumbers: false },
    },
    holdings: demoHoldings,
    inbox: {
      transfers: [
        { id: "transfer-1", senderName: "joecoder", receiverName: "joe.investor", amountCents: 12500, message: "Research contribution", status: "pending", createdAt: isoHoursAgo(3) },
      ],
      shareOffers: [
        { id: "offer-1", sellerName: "notderek", buyerName: "joe.investor", ticker: "JCT", quantity: 4, askingPriceCents: 24000, status: "pending", createdAt: isoHoursAgo(5) },
      ],
    },
  };
}

export function createDemoJoeBankSnapshot(): JoeBankSnapshot {
  return {
    financialStatus: "bankrupt",
    canApply: false,
    maxLoanCents: 1_000_000,
    defaultAnnualRateBps: 800,
    disclosure: "Joe Bank loans use a variable annual rate. Daily interest is added once at the 10:00 PM New York close, using the rate and outstanding liability then in effect. Repayments may be made from disposable J$ at any time; no automatic payment or real-world obligation exists.",
    loans: [
      {
        id: "loan-demo",
        principalCents: 75_000,
        outstandingCents: 75_000,
        annualRateBps: 850,
        rateKind: "variable",
        status: "active",
        stage: "active",
        requestNote: "Temporary support while reorganizing my simulated portfolio.",
        decisionNote: "Approved for the standard recovery window.",
        requestedAt: isoHoursAgo(48),
        decidedAt: isoHoursAgo(44),
        openedAt: isoHoursAgo(43),
        updatedAt: isoHoursAgo(20),
        closedAt: null,
      },
    ],
  };
}

