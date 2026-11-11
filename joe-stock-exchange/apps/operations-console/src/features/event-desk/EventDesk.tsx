import type { Asset, Direction, NewsEvent, Severity } from "@joese/contracts";
import { CalendarClock, Check, FilePlus2, Send } from "lucide-react";
import { useState } from "react";

interface Props { assets: Asset[]; news: NewsEvent[]; onCreate: (input: Omit<NewsEvent, "id" | "publishedAt" | "authorName"> & { durationTicks: number; publishAt?: string }) => Promise<void>; }

export function EventDesk({ assets, news, onCreate }: Props) {
  const [headline, setHeadline] = useState(""); const [article, setArticle] = useState("");
  const [category, setCategory] = useState("launch"); const [direction, setDirection] = useState<Direction>("bullish");
  const [severity, setSeverity] = useState<Severity>("mild"); const [durationTicks, setDuration] = useState(1);
  const [tickers, setTickers] = useState<string[]>([]); const [status, setStatus] = useState<"draft" | "scheduled" | "published">("draft");
  const [publishAt, setPublishAt] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const toggleTicker = (ticker: string) => setTickers((current) => current.includes(ticker) ? current.filter((value) => value !== ticker) : [...current, ticker]);
  const submit = async () => { setBusy(true); try { await onCreate({ headline, article, category, direction, severity, affectedTickers: tickers, durationTicks, status, publishAt: publishAt ? new Date(publishAt).toISOString() : undefined }); setDone(true); setHeadline(""); setArticle(""); setTickers([]); } finally { setBusy(false); } };
  return (
    <div className="event-layout">
      <section className="console-card event-composer">
        <div className="form-title"><div><span className="eyebrow">THE JOE WIRE</span><h2>New structured event</h2><p>Events influence future ticks. This form cannot set a price or percentage directly.</p></div><FilePlus2 size={22} /></div>
        <label className="full-field"><span>Headline</span><input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="What happened in the Joe Universe?" /></label>
        <label className="full-field"><span>Short lore article</span><textarea className="tall" value={article} onChange={(event) => setArticle(event.target.value)} /></label>
        <div className="console-form-grid three">
          <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{["launch","discovery","scandal","cultural event","research result","infrastructure incident","Joekemon event"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Direction</span><select value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>{["bullish","bearish","mixed","uncertain"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Severity</span><select value={severity} onChange={(event) => setSeverity(event.target.value as Severity)}>{["mild","moderate","major"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label><span>Duration</span><select value={durationTicks} onChange={(event) => setDuration(Number(event.target.value))}><option value={1}>One tick</option><option value={2}>Two ticks</option><option value={3}>Three ticks (60/25/15)</option></select></label>
          <label><span>Publication</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="draft">Save draft</option><option value="scheduled">Schedule</option><option value="published">Publish now</option></select></label>
          <label><span>Publish at</span><input type="datetime-local" value={publishAt} disabled={status !== "scheduled"} onChange={(event) => setPublishAt(event.target.value)} /></label>
        </div>
        <div className="affected-assets"><span>Affected listings</span><div>{assets.map((asset) => <button key={asset.ticker} className={tickers.includes(asset.ticker) ? "active" : ""} onClick={() => toggleTicker(asset.ticker)}>{tickers.includes(asset.ticker) && <Check size={12} />}{asset.ticker}</button>)}</div></div>
        <footer className="form-footer"><span>{done && <><Check size={14} /> Event created</>}</span><button disabled={busy || headline.length < 5 || article.length < 20 || tickers.length === 0 || (status === "scheduled" && !publishAt)} onClick={submit}><Send size={15} />{busy ? "Submitting…" : status === "published" ? "Publish to all members" : status === "scheduled" ? "Schedule event" : "Save draft"}</button></footer>
      </section>
      <aside className="event-history console-card"><div className="compact-title"><div><span className="eyebrow">RECENT</span><h3>Event desk</h3></div><CalendarClock size={18} /></div>{news.map((item) => <article key={item.id}><div><span className={`status-tag ${item.status}`}>{item.status}</span><span>{item.severity}</span></div><strong>{item.headline}</strong><p>{item.affectedTickers.join(" · ")}</p></article>)}</aside>
    </div>
  );
}

