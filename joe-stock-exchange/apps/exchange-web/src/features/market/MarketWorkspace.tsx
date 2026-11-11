import type { Asset, MarketComment, NewsEvent, PricePoint, UserPreferences } from "@joese/contracts";
import { formatJoellars, formatPercent } from "@joese/ui";
import { ArrowDownRight, ArrowUpRight, Building2, Clock3, ExternalLink, Info, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { NewsAndComments } from "../joe-wire/NewsAndComments";
import { PriceChart } from "./PriceChart";

interface Props {
  asset: Asset;
  points: PricePoint[];
  news: NewsEvent[];
  comments: MarketComment[];
  preferences: UserPreferences;
  marketStatus: "open" | "locked" | "closed";
  onComment: (body: string) => Promise<void>;
  onOrder: (side: "buy" | "sell", quantity: number) => Promise<void>;
}

export function MarketWorkspace({ asset, points, news, comments, preferences, marketStatus, onComment, onOrder }: Props) {
  const [range, setRange] = useState("1D");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState(asset.type === "stock" ? "1" : "1.00");
  const [orderState, setOrderState] = useState<string | null>(null);
  const positive = asset.percentChange >= 0;
  const trendColor = positive ? preferences.growthColor : preferences.fallColor;
  const submitOrder = async () => {
    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setOrderState("Submitting…");
    try {
      await onOrder(side, parsed);
      setOrderState("Order opened");
    } catch (error) {
      setOrderState(error instanceof Error ? error.message : "Order failed");
    }
  };

  const stats = [
    ["Open", asset.openPriceCents],
    ["High today", asset.highPriceCents],
    ["Low today", asset.lowPriceCents],
    ["Previous close", asset.closePriceCents],
  ] as const;

  return (
    <main className="market-workspace">
      <section className="market-hero">
        <div className="company-title-row">
          <div className="company-mark">{asset.ticker.slice(0, 2)}</div>
          <div className="company-heading">
            <div className="ticker-line"><span>{asset.ticker}</span><span className={`market-pill ${asset.active ? "open" : "closed"}`}>{asset.active ? "TRADING" : "DELISTED"}</span></div>
            <h1>{asset.name}</h1>
          </div>
          <div className="price-heading">
            <strong>{formatJoellars(asset.currentPriceCents)}</strong>
            <span style={{ color: trendColor }}>{positive ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}{formatPercent(asset.percentChange)} today</span>
          </div>
        </div>
        <div className="market-stat-strip">
          {stats.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatJoellars(value)}</strong></div>)}
          <div><span>Last update</span><strong><Clock3 size={14} /> {new Date(asset.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</strong></div>
        </div>
      </section>

      <section className="chart-card">
        <div className="chart-toolbar">
          <div><span className="eyebrow">PRICE FLUCTUATION</span><h2>{range === "1D" ? "Today's movement" : `${range} performance`}</h2></div>
          <div className="segmented">{["1D", "1W", "1M", "ALL"].map((value) => <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{value}</button>)}</div>
        </div>
        <PriceChart points={points} positive={positive} growthColor={preferences.growthColor} fallColor={preferences.fallColor} />
        <div className="chart-note"><Info size={15} /> Official prices update hourly. Trades influence the next eligible tick.</div>
      </section>

      <section className="trade-and-about">
        <article className="company-card">
          <div className="section-heading"><div><span className="eyebrow">COMPANY PROFILE</span><h2>About {asset.name}</h2></div><Building2 size={20} /></div>
          <p className="company-lede">{asset.description}</p>
          <p>{asset.companyDetails.overview}</p>
          <dl className="company-facts">
            <div><dt>Developer</dt><dd>{asset.companyDetails.developer ?? "Joe Team"}</dd></div>
            <div><dt>Founded</dt><dd>{asset.companyDetails.founded ?? "Joe Era"}</dd></div>
            <div><dt>Headquarters</dt><dd>{asset.companyDetails.headquarters ?? "Joe Universe"}</dd></div>
            <div><dt>Type</dt><dd>{asset.type === "stock" ? "Fictional equity" : "Fictional crypto-asset"}</dd></div>
          </dl>
          {asset.companyDetails.focus && <div className="focus-tags">{asset.companyDetails.focus.map((focus) => <span key={focus}>{focus}</span>)}</div>}
          {asset.companyDetails.projectUrl && <a className="project-link" href={asset.companyDetails.projectUrl} target="_blank" rel="noreferrer">View project <ExternalLink size={14} /></a>}
          <div className="fictional-notice"><ShieldCheck size={18} /><span><strong>Simulation listing</strong>This listing is fictional and carries no real-world ownership or cash value.</span></div>
        </article>

        <aside className="trade-ticket">
          <span className="eyebrow">ORDER TICKET</span>
          <div className="trade-side"><button className={side === "buy" ? "buy active" : ""} onClick={() => setSide("buy")}>Buy</button><button className={side === "sell" ? "sell active" : ""} onClick={() => setSide("sell")}>Sell</button></div>
          <label><span>Quantity</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" /></label>
          <div className="order-estimate"><span>Estimated value</span><strong>{formatJoellars(Math.round(Number(quantity || 0) * asset.currentPriceCents))}</strong></div>
          <button className={`primary-action ${side}`} onClick={submitOrder} disabled={marketStatus !== "open" || !asset.active}>{marketStatus === "locked" ? "Market updating" : marketStatus === "closed" ? "Market closed" : side === "buy" ? "Open buy order" : "Open sell order"}</button>
          {orderState && <div className="order-state">{orderState}</div>}
          <p>Orders enter the matching queue. A displayed quote is not an automatic redemption promise.</p>
        </aside>
      </section>

      <NewsAndComments ticker={asset.ticker} news={news} comments={comments} onComment={onComment} />
    </main>
  );
}

