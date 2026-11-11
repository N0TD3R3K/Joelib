import type { Holding, MarketComment, MarketSnapshot, PortfolioSnapshot, UserPreferences } from "@joese/contracts";
import { formatJoellars, formatQuantity } from "@joese/ui";
import { Bell, ChevronLeft, Clock3, Inbox, Menu, Settings, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createOrder, createShareOffer, createTransfer, demoMode, loadMarket, loadPortfolio,
  postComment, resolveShareOffer, resolveTransfer, updateSettings, verifyEmail,
} from "./api";
import { AuthScreen } from "./features/auth/AuthScreen";
import { AssetRail } from "./features/market/AssetRail";
import { MarketWorkspace } from "./features/market/MarketWorkspace";
import { PortfolioRail } from "./features/portfolio/PortfolioRail";
import { SettingsPage } from "./features/settings/SettingsPage";

type Modal = "transaction" | "inbox" | "share-offer" | null;

export function App() {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [selectedTicker, setSelectedTicker] = useState("JAI");
  const [rightOpen, setRightOpen] = useState(true);
  const [page, setPage] = useState<"exchange" | "settings">(window.location.pathname.endsWith("/settings") ? "settings" : "exchange");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [marketResult, portfolioResult] = await Promise.all([loadMarket(), loadPortfolio()]);
      setMarket(marketResult);
      setPortfolio(portfolioResult);
    } catch (error) {
      setPortfolio(null);
      setAuthMessage(error instanceof Error ? error.message : "Sign in to continue.");
      if (!market) {
        try { setMarket(await loadMarket()); } catch { setMarket(null); }
      }
    } finally { setLoading(false); }
  }, [market]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (window.location.pathname === "/verify" && token && !demoMode) {
      verifyEmail(token)
        .then(() => { setAuthMessage("School email verified. You can now sign in."); window.history.replaceState({}, "", "/"); })
        .catch((error) => setAuthMessage(error instanceof Error ? error.message : "Verification failed"))
        .finally(() => void refresh());
    } else {
      void refresh();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAsset = useMemo(
    () => market?.assets.find((asset) => asset.ticker === selectedTicker) ?? market?.assets[0],
    [market, selectedTicker],
  );

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  if (loading && !portfolio) return <div className="loading-screen"><div className="brand-gem large">J</div><span>Opening the exchange…</span></div>;
  if (!portfolio) return <AuthScreen onAuthenticated={refresh} initialMessage={authMessage} />;
  if (page === "settings") {
    return (
      <SettingsPage
        portfolio={portfolio}
        onBack={() => { setPage("exchange"); window.history.pushState({}, "", "/"); }}
        onSave={async (username, preferences) => {
          await updateSettings(username, preferences);
          setPortfolio((current) => current ? { ...current, summary: { ...current.summary, username, preferences } } : current);
        }}
      />
    );
  }
  if (!market || !selectedAsset) return <div className="loading-screen"><span>Market data is unavailable.</span></div>;

  const handleComment = async (body: string) => {
    await postComment(selectedAsset.ticker, body);
    const comment: MarketComment = { id: crypto.randomUUID(), assetTicker: selectedAsset.ticker, authorName: portfolio.summary.username, body, createdAt: new Date().toISOString(), status: "visible" };
    setMarket((current) => current ? { ...current, comments: [comment, ...current.comments] } : current);
  };

  return (
    <div className={`exchange-app ${rightOpen ? "" : "portfolio-collapsed"}`} style={{ "--growth": portfolio.summary.preferences.growthColor, "--fall": portfolio.summary.preferences.fallColor } as React.CSSProperties}>
      <header className="exchange-header">
        <button className="mobile-menu icon-button"><Menu size={19} /></button>
        <div className="brand-lockup"><span className="brand-gem">J</span><div><strong>JOESE</strong><small>JOE Stock Exchange</small></div></div>
        <div className="market-clock"><span className={`status-dot ${market.marketStatus}`}></span><strong>{market.marketStatus === "open" ? "Market open" : market.marketStatus}</strong><span><Clock3 size={14} /> Next tick {new Date(market.nextTickAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div>
        <div className="header-actions"><button><Bell size={18} /><span className="notification-dot"></span></button><button onClick={() => setModal("inbox")}><Inbox size={18} /></button><button onClick={() => { setPage("settings"); window.history.pushState({}, "", "/settings"); }}><Settings size={18} /></button><div className="user-chip">{portfolio.summary.username.slice(0, 2).toUpperCase()}</div></div>
      </header>
      <div className="exchange-grid">
        <AssetRail assets={market.assets} selectedTicker={selectedAsset.ticker} onSelect={setSelectedTicker} />
        <MarketWorkspace
          asset={selectedAsset}
          points={market.priceHistory[selectedAsset.ticker] ?? []}
          news={market.news}
          comments={market.comments}
          preferences={portfolio.summary.preferences}
          marketStatus={market.marketStatus}
          onComment={handleComment}
          onOrder={async (side, quantity) => { await createOrder({ ticker: selectedAsset.ticker, side, quantity }); await refresh(); notify(`${side === "buy" ? "Buy" : "Sell"} order opened for ${formatQuantity(quantity)} ${selectedAsset.ticker}`); }}
        />
        {rightOpen ? (
          <PortfolioRail
            portfolio={portfolio}
            onCollapse={() => setRightOpen(false)}
            onTransaction={() => setModal("transaction")}
            onInbox={() => setModal("inbox")}
            onSettings={() => { setPage("settings"); window.history.pushState({}, "", "/settings"); }}
            onSellShares={(holding) => { setSelectedHolding(holding); setModal("share-offer"); }}
          />
        ) : (
          <button className="portfolio-reveal" onClick={() => setRightOpen(true)} title="Show portfolio"><ChevronLeft size={18} /><span>Portfolio</span></button>
        )}
      </div>
      {modal === "transaction" && <TransactionModal available={portfolio.summary.disposableBalanceCents} onClose={() => setModal(null)} onSubmit={async (receiver, amountCents, message) => { await createTransfer(receiver, amountCents, message); setPortfolio((current) => current ? { ...current, summary: { ...current.summary, disposableBalanceCents: current.summary.disposableBalanceCents - amountCents } } : current); setModal(null); notify("Transaction sent to the receiver's inbox"); }} />}
      {modal === "inbox" && <InboxModal portfolio={portfolio} onClose={() => setModal(null)} onTransfer={async (id, action) => { await resolveTransfer(id, action); await refresh(); setModal(null); notify(`Transfer ${action === "accept" ? "received" : "declined"}`); }} onOffer={async (id, action) => { await resolveShareOffer(id, action); await refresh(); setModal(null); notify(`Share offer ${action === "accept" ? "accepted" : "declined"}`); }} />}
      {modal === "share-offer" && selectedHolding && <ShareOfferModal holding={selectedHolding} onClose={() => setModal(null)} onSubmit={async (buyer, quantity, askingPriceCents) => { await createShareOffer({ buyer, ticker: selectedHolding.ticker, quantity, askingPriceCents }); await refresh(); setModal(null); notify(`Frozen ${selectedHolding.ticker} offer sent to ${buyer}`); }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function ModalShell({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card"><header><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose}><X size={19} /></button></header>{children}</section></div>;
}

function TransactionModal({ available, onClose, onSubmit }: { available: number; onClose: () => void; onSubmit: (receiver: string, amount: number, message: string) => Promise<void> }) {
  const [receiver, setReceiver] = useState(""); const [amount, setAmount] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const cents = Math.round(Number(amount) * 100);
  return <ModalShell title="Send a transaction" eyebrow="RECEIVER APPROVAL REQUIRED" onClose={onClose}><p className="modal-intro">The J$ is reserved now. It reaches the other account only after the receiver chooses Receive in their inbox.</p><label className="form-field"><span>Receiver username or school email</span><input value={receiver} onChange={(event) => setReceiver(event.target.value)} placeholder="joecoder" /></label><label className="form-field"><span>Amount</span><div className="money-input"><b>J$</b><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /></div><small>Disposable: {formatJoellars(available)}</small></label><label className="form-field"><span>Message</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={280} placeholder="What is this for?" /></label><button className="modal-submit" disabled={busy || !receiver || cents <= 0 || cents > available} onClick={async () => { setBusy(true); try { await onSubmit(receiver, cents, message); } finally { setBusy(false); } }}>{busy ? "Sending…" : "Send to inbox"}</button></ModalShell>;
}

function ShareOfferModal({ holding, onClose, onSubmit }: { holding: Holding; onClose: () => void; onSubmit: (buyer: string, quantity: number, price: number) => Promise<void> }) {
  const [buyer, setBuyer] = useState(""); const [quantity, setQuantity] = useState(""); const [price, setPrice] = useState(""); const [busy, setBusy] = useState(false);
  return <ModalShell title={`Offer ${holding.ticker} shareholding`} eyebrow="SELLER-INITIATED ONLY" onClose={onClose}><p className="modal-intro">Choose the buyer directly. Buyers cannot submit requests for your frozen assets.</p><div className="offer-summary"><span>Available frozen shares</span><strong>{formatQuantity(holding.frozenQuantity)}</strong></div><label className="form-field"><span>Buyer username or school email</span><input value={buyer} onChange={(event) => setBuyer(event.target.value)} /></label><div className="form-split"><label className="form-field"><span>Shares</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" /></label><label className="form-field"><span>Total asking price</span><div className="money-input"><b>J$</b><input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" /></div></label></div><button className="modal-submit" disabled={busy || !buyer || Number(quantity) <= 0 || Number(quantity) > holding.frozenQuantity || Number(price) <= 0} onClick={async () => { setBusy(true); try { await onSubmit(buyer, Number(quantity), Math.round(Number(price) * 100)); } finally { setBusy(false); } }}>{busy ? "Sending…" : "Send private offer"}</button></ModalShell>;
}

function InboxModal({ portfolio, onClose, onTransfer, onOffer }: { portfolio: PortfolioSnapshot; onClose: () => void; onTransfer: (id: string, action: "accept" | "decline") => Promise<void>; onOffer: (id: string, action: "accept" | "decline") => Promise<void> }) {
  const { transfers, shareOffers } = portfolio.inbox;
  return <ModalShell title="Inbox" eyebrow="PENDING FOR YOUR DECISION" onClose={onClose}><div className="inbox-list">{transfers.map((item) => <article className="inbox-item" key={item.id}><div className="inbox-icon">J$</div><div><strong>{item.senderName} sent {formatJoellars(item.amountCents)}</strong><p>{item.message || "No message"}</p><span>Funds arrive only if you receive them.</span></div><div className="inbox-decisions"><button onClick={() => onTransfer(item.id, "decline")}>Decline</button><button className="accept" onClick={() => onTransfer(item.id, "accept")}>Receive</button></div></article>)}{shareOffers.map((item) => <article className="inbox-item" key={item.id}><div className="inbox-icon shares">{item.ticker}</div><div><strong>{item.sellerName} offered {formatQuantity(item.quantity)} {item.ticker}</strong><p>Total asking price: {formatJoellars(item.askingPriceCents)}</p><span>Accepted shares remain frozen shareholding assets.</span></div><div className="inbox-decisions"><button onClick={() => onOffer(item.id, "decline")}>Decline</button><button className="accept" onClick={() => onOffer(item.id, "accept")}>Accept offer</button></div></article>)}{transfers.length + shareOffers.length === 0 && <div className="empty-inbox"><Inbox size={32} /><strong>Your inbox is clear</strong><span>Incoming transactions and private share offers appear here.</span></div>}</div></ModalShell>;
}

