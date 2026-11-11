import type { Holding, PortfolioSnapshot } from "@joese/contracts";
import { formatJoellars, formatPercent, formatQuantity } from "@joese/ui";
import { ArrowLeftRight, Bell, ChevronRight, CreditCard, Inbox, Landmark, Settings, Snowflake, WalletCards } from "lucide-react";

interface Props {
  portfolio: PortfolioSnapshot;
  onCollapse: () => void;
  onTransaction: () => void;
  onInbox: () => void;
  onSellShares: (holding: Holding) => void;
  onSettings: () => void;
}

function HoldingTable({ title, holdings, onSellShares }: { title: string; holdings: Holding[]; onSellShares?: (holding: Holding) => void }) {
  return (
    <section className="holding-section">
      <div className="holding-title"><h3>{title}</h3><span>{holdings.length}</span></div>
      {holdings.length === 0 ? <div className="empty-holding">No current holdings</div> : (
        <div className="holding-table">
          {holdings.map((holding) => (
            <div className="holding-row" key={holding.id}>
              <div className="holding-symbol">{holding.ticker.slice(0, 2)}</div>
              <div className="holding-main"><strong>{holding.ticker}</strong><span>{formatQuantity(holding.quantity)} units</span></div>
              <div className="holding-value"><strong>{formatJoellars(holding.marketValueCents)}</strong><span className={holding.percentChange >= 0 ? "positive" : "negative"}>{formatPercent(holding.percentChange)}</span></div>
              {onSellShares && <button className="sell-holding" onClick={() => onSellShares(holding)}>Offer</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PortfolioRail({ portfolio, onCollapse, onTransaction, onInbox, onSellShares, onSettings }: Props) {
  const { summary, holdings, inbox } = portfolio;
  const inboxCount = inbox.transfers.length + inbox.shareOffers.length;
  const metricCards = [
    { label: "Frozen assets", value: summary.frozenAssetValueCents, icon: Snowflake, tone: "violet" },
    { label: "Asset value", value: summary.assetValueCents, icon: WalletCards, tone: "blue" },
    { label: "Disposable", value: summary.disposableBalanceCents, icon: CreditCard, tone: "gold" },
    { label: "Joe Bank", value: summary.borrowedCents, icon: Landmark, tone: "red" },
  ];
  return (
    <aside className="portfolio-rail">
      <div className="portfolio-topline">
        <div><span>MY PORTFOLIO</span><strong>{summary.username}</strong></div>
        <button className="icon-button" onClick={onCollapse} title="Hide portfolio"><ChevronRight size={18} /></button>
      </div>
      <div className="portfolio-actions">
        <button className="transaction-button" onClick={onTransaction}><ArrowLeftRight size={17} /><span>New transaction</span></button>
        <button className="inbox-button" onClick={onInbox} title="Open inbox"><Inbox size={18} />{inboxCount > 0 && <b>{inboxCount}</b>}</button>
        <button className="inbox-button" onClick={onSettings} title="Settings"><Settings size={18} /></button>
      </div>
      <div className="wealth-grid">
        {metricCards.map(({ label, value, icon: Icon, tone }) => (
          <article className={`wealth-card ${tone}`} key={label}>
            <div><span>{label}</span><Icon size={16} /></div>
            <strong>{formatJoellars(value, { compact: summary.preferences.compactNumbers })}</strong>
          </article>
        ))}
      </div>
      <div className="portfolio-total"><span>Simulated net position</span><strong>{formatJoellars(summary.disposableBalanceCents + summary.frozenAssetValueCents + summary.assetValueCents - summary.borrowedCents)}</strong></div>
      <div className="holdings-scroll">
        <HoldingTable title="Shareholdings" holdings={holdings.filter((holding) => holding.kind === "shareholding")} onSellShares={onSellShares} />
        <HoldingTable title="Stock holdings" holdings={holdings.filter((holding) => holding.kind === "stock")} />
        <HoldingTable title="Crypto holdings" holdings={holdings.filter((holding) => holding.kind === "crypto")} />
      </div>
      <div className="rail-footer"><Bell size={14} /> Updates settle on official market ticks</div>
    </aside>
  );
}

