import type { Asset, MarketComment, NewsEvent } from "@joese/contracts";
import { Activity, Bell, BookOpen, ChevronDown, FileClock, LayoutDashboard, LogOut, Menu, MessageSquareText, Newspaper, Search, Settings, ShieldCheck, SlidersHorizontal, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { apiReferenceUrl, consoleLogin, createNews, loadConsoleData, moderateComment, saveAsset } from "./api";
import { AssetEditor } from "./features/asset-editor/AssetEditor";
import { AuditLog } from "./features/audit-log/AuditLog";
import { CommentModeration } from "./features/comment-moderation/CommentModeration";
import { EventDesk } from "./features/event-desk/EventDesk";
import { MarketMonitor } from "./features/market-monitor/MarketMonitor";
import { MemberManagement } from "./features/member-management/MemberManagement";
import { TurnstileWidget, turnstileEnabled } from "./TurnstileWidget";

type Page = "monitor" | "assets" | "events" | "comments" | "members" | "audit";
interface ConsoleData { assets: Asset[]; news: NewsEvent[]; comments: MarketComment[]; members: Record<string, unknown>[]; market: { ticks: Record<string, unknown>[]; orders: Record<string, unknown>[] }; audit: Record<string, unknown>[]; }

const navigation: Array<[Page, string, typeof Activity]> = [
  ["monitor","Market monitor",LayoutDashboard], ["assets","Listings & details",SlidersHorizontal], ["events","Joe Wire events",Newspaper], ["comments","Comments",MessageSquareText], ["members","Members",UsersRound], ["audit","Audit log",FileClock],
];

export function App() {
  const [page, setPage] = useState<Page>("monitor");
  const [data, setData] = useState<ConsoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const load = async () => { setLoading(true); try { setData(await loadConsoleData()); setAuthError(null); } catch (error) { setAuthError(error instanceof Error ? error.message : "Operator access required"); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const notify = (value: string) => { setToast(value); window.setTimeout(() => setToast(null), 2400); };
  if (loading && !data) return <div className="console-loading"><span className="console-brand-mark">J</span><p>Connecting to market operations…</p></div>;
  if (!data) return <ConsoleLogin error={authError} onLogin={async (email,password,turnstileToken) => { await consoleLogin(email,password,turnstileToken); await load(); }} />;
  const currentLabel = navigation.find(([value]) => value === page)?.[1] ?? "Operations";
  return (
    <div className="console-app">
      <aside className="console-sidebar">
        <div className="console-brand"><span className="console-brand-mark">J</span><div><strong>JOESE</strong><small>MARKET OPERATIONS</small></div></div>
        <nav><span className="nav-label">CONTROL CENTER</span>{navigation.map(([value,label,Icon]) => <button key={value} className={page === value ? "active" : ""} onClick={() => setPage(value)}><Icon size={17}/><span>{label}</span>{value === "comments" && data.comments.filter((item) => item.status === "flagged").length > 0 && <b>{data.comments.filter((item) => item.status === "flagged").length}</b>}</button>)}</nav>
        <div className="console-side-bottom"><a href={apiReferenceUrl} target="_blank" rel="noreferrer"><BookOpen size={16}/><span>Open API reference</span></a><button><Settings size={16}/><span>Console settings</span></button><div className="operator-card"><div>MO</div><span><strong>market.ops</strong><small>Market operator</small></span><ChevronDown size={14}/></div></div>
      </aside>
      <main className="console-main">
        <header className="console-header"><button className="console-mobile-menu"><Menu size={19}/></button><div><span>JOESE / OPERATIONS</span><h1>{currentLabel}</h1></div><label className="global-search"><Search size={15}/><input placeholder="Search operations" /></label><div className="console-header-actions"><div className="console-live"><i></i> Systems live</div><button><Bell size={17}/></button></div></header>
        <div className="console-content">
          {page === "monitor" && <MarketMonitor assets={data.assets} news={data.news} members={data.members} market={data.market} />}
          {page === "assets" && <AssetEditor assets={data.assets} onSave={async (asset) => { const saved = await saveAsset(asset); setData((current) => current ? { ...current, assets: current.assets.map((item) => item.ticker === saved.ticker ? saved : item) } : current); notify(`${saved.ticker} company details saved`); }} />}
          {page === "events" && <EventDesk assets={data.assets} news={data.news} onCreate={async (input) => { await createNews(input); const newEvent: NewsEvent = { ...input, id: crypto.randomUUID(), authorName: "market.ops", publishedAt: input.publishAt ?? new Date().toISOString() }; setData((current) => current ? { ...current, news: [newEvent, ...current.news] } : current); notify("Joe Wire event created"); }} />}
          {page === "comments" && <CommentModeration comments={data.comments} onModerate={async (id,status) => { await moderateComment(id,status); setData((current) => current ? { ...current, comments: current.comments.map((item) => item.id === id ? { ...item, status } : item) } : current); notify(`Comment marked ${status}`); }} />}
          {page === "members" && <MemberManagement members={data.members} />}
          {page === "audit" && <AuditLog rows={data.audit} />}
        </div>
      </main>
      {toast && <div className="console-toast">{toast}</div>}
    </div>
  );
}

function ConsoleLogin({ error, onLogin }: { error: string | null; onLogin: (email: string, password: string, turnstileToken: string) => Promise<void> }) {
  const [email,setEmail] = useState(""); const [password,setPassword] = useState(""); const [message,setMessage] = useState(error ?? ""); const [busy,setBusy] = useState(false); const [turnstileToken,setTurnstileToken] = useState("");
  return <div className="console-login"><section><span className="console-brand-mark large">J</span><div><span className="eyebrow">RESTRICTED SYSTEM</span><h1>Market Operations Console</h1><p>Structured market events, listing details, member administration, and the permanent integrity record.</p></div><div className="restricted-note"><ShieldCheck size={18}/><span>Operator actions are attributed and audited. Operator accounts cannot trade.</span></div></section><main><div><span className="eyebrow">AUTHORIZED ACCESS</span><h2>Operator sign in</h2><p>Use an operator or administrator account.</p><label><span>School email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><TurnstileWidget onToken={setTurnstileToken}/>{message && <div className="login-error">{message}</div>}<button disabled={busy || (turnstileEnabled && !turnstileToken)} onClick={async () => { setBusy(true); setMessage(""); try { await onLogin(email,password,turnstileToken); } catch (e) { setMessage(e instanceof Error ? e.message : "Sign-in failed"); } finally { setBusy(false); } }}>{busy ? "Authenticating…" : "Enter operations"}</button><small><ShieldCheck size={13}/> Protected console · all writes require a server-side role check</small></div></main></div>;
}

