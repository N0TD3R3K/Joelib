export type AssetType = "stock" | "crypto";
export type HoldingKind = "shareholding" | "stock" | "crypto";
export type Direction = "bullish" | "bearish" | "mixed" | "uncertain";
export type Severity = "mild" | "moderate" | "major";

export interface CompanyDetails {
  overview: string;
  developer?: string;
  founded?: string;
  headquarters?: string;
  projectUrl?: string;
  focus?: string[];
}

export interface Asset {
  id: string;
  ticker: string;
  name: string;
  type: AssetType;
  description: string;
  companyDetails: CompanyDetails;
  currentPriceCents: number;
  openPriceCents: number;
  highPriceCents: number;
  lowPriceCents: number;
  closePriceCents: number;
  previousCloseCents: number;
  percentChange: number;
  active: boolean;
  updatedAt: string;
}

export interface PricePoint {
  assetId: string;
  priceCents: number;
  recordedAt: string;
}

export interface NewsEvent {
  id: string;
  headline: string;
  article: string;
  category: string;
  direction: Direction;
  severity: Severity;
  affectedTickers: string[];
  publishedAt: string;
  authorName: string;
  status: "draft" | "scheduled" | "published" | "archived";
}

export interface MarketComment {
  id: string;
  assetTicker: string;
  authorName: string;
  body: string;
  createdAt: string;
  status: "visible" | "hidden" | "flagged";
}

export interface UserPreferences {
  growthColor: string;
  fallColor: string;
  compactNumbers: boolean;
}

export interface UserSummary {
  id: string;
  username: string;
  email: string;
  role: "member" | "operator" | "administrator";
  disposableBalanceCents: number;
  frozenAssetValueCents: number;
  assetValueCents: number;
  borrowedCents: number;
  preferences: UserPreferences;
}

export interface Holding {
  id: string;
  assetId: string;
  ticker: string;
  name: string;
  kind: HoldingKind;
  quantity: number;
  frozenQuantity: number;
  averageCostCents: number;
  currentPriceCents: number;
  marketValueCents: number;
  percentChange: number;
}

export interface PendingTransfer {
  id: string;
  senderName: string;
  receiverName: string;
  amountCents: number;
  message: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

export interface ShareOffer {
  id: string;
  sellerName: string;
  buyerName: string;
  ticker: string;
  quantity: number;
  askingPriceCents: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

export interface InboxPayload {
  transfers: PendingTransfer[];
  shareOffers: ShareOffer[];
}

export interface MarketSnapshot {
  assets: Asset[];
  priceHistory: Record<string, PricePoint[]>;
  news: NewsEvent[];
  comments: MarketComment[];
  marketStatus: "open" | "locked" | "closed";
  nextTickAt: string;
}

export interface PortfolioSnapshot {
  summary: UserSummary;
  holdings: Holding[];
  inbox: InboxPayload;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export interface ApiSuccess<T> {
  data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

