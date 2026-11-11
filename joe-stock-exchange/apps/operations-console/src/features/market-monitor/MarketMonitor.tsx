import type { Asset, NewsEvent } from "@joese/contracts";
import { formatJoellars, formatPercent } from "@joese/ui";
import { Activity, Clock3, Database, FileClock, LockKeyhole, ServerCog, TrendingUp, UsersRound } from "lucide-react";

interface Props { assets: Asset[]; news: NewsEvent[]; members: Record<string, unknown>[]; market: { ticks: Record<string, unknown>[]; orders: Record<string, unknown>[] }; }

export function MarketMonitor({ assets, news, members, market }: Props) {
  const cards = [
    ["Active listings", assets.filter((asset) => asset.active).length, TrendingUp, "gold"],
    ["Verified members", members.filter((member) => member.status === "active").length, UsersRound, "blue"],
    ["Open orders", Number(market.orders.find((row) => row.status === "open")?.count ?? 0), FileClock, "violet"],
    ["Published events", news.filter((item) => item.status === "published").length, Activity, "green"],
  ] as const;
  return <div className="monitor-page"><div className="monitor-cards">{cards.map(([label,value,Icon,tone]) => <article className={`monitor-card ${tone}`} key={label}><div><span>{label}</span><Icon size={18} /></div><strong>{value}</strong><small>Current system record</small></article>)}</div><div className="monitor-grid"><section className="console-card"><div className="compact-title"><div><span className="eyebrow">LIVE BOARD</span><h3>Listing status</h3></div><Activity size={18} /></div><div className="market-table"><div className="market-table-head"><span>Listing</span><span>Price</span><span>Today</span><span>State</span></div>{assets.slice(0,8).map((asset) => <div key={asset.ticker}><strong>{asset.ticker}<small>{asset.name}</small></strong><span>{formatJoellars(asset.currentPriceCents)}</span><span className={asset.percentChange >= 0 ? "positive" : "negative"}>{formatPercent(asset.percentChange)}</span><span className={`status-tag ${asset.active ? "published" : "hidden"}`}>{asset.active ? "active" : "inactive"}</span></div>)}</div></section><aside className="system-stack"><section className="console-card system-health"><div className="compact-title"><div><span className="eyebrow">CLOUDFLARE</span><h3>System health</h3></div><ServerCog size={18} /></div>{([[
    "Exchange API", "Operational", Database,
  ], [
    "Market engine", "Hourly", Clock3,
  ], [
    "Console access", "Protected", LockKeyhole,
  ]] as const).map(([label,state,Icon]) => <div key={label}><Icon size={15}/><span><strong>{label}</strong><small>{state}</small></span><b></b></div>)}</section><section className="console-card last-tick"><span className="eyebrow">LAST MARKET TICK</span><strong>{String(market.ticks[0]?.tick_key ?? "No tick yet")}</strong><span className="status-tag complete">{String(market.ticks[0]?.status ?? "waiting")}</span></section></aside></div></div>;
}

