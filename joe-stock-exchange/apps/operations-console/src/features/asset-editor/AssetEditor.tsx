import type { Asset } from "@joese/contracts";
import { Check, CircleDot, Save, Search } from "lucide-react";
import { useMemo, useState } from "react";

interface Props { assets: Asset[]; onSave: (asset: Asset) => Promise<void>; }

export function AssetEditor({ assets, onSave }: Props) {
  const [selectedTicker, setSelectedTicker] = useState(assets[0]?.ticker ?? "");
  const [query, setQuery] = useState("");
  const source = assets.find((asset) => asset.ticker === selectedTicker) ?? assets[0];
  const [draft, setDraft] = useState<Asset | null>(source ? structuredClone(source) : null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const filtered = useMemo(() => assets.filter((asset) => `${asset.ticker} ${asset.name}`.toLowerCase().includes(query.toLowerCase())), [assets, query]);
  const select = (asset: Asset) => { setSelectedTicker(asset.ticker); setDraft(structuredClone(asset)); setSaved(false); };
  if (!draft) return <div className="console-empty">No listings available.</div>;
  const updateDetails = (key: string, value: string) => setDraft((current) => current ? { ...current, companyDetails: { ...current.companyDetails, [key]: value } } : current);
  const save = async () => { setSaving(true); try { await onSave(draft); setSaved(true); } finally { setSaving(false); } };
  return (
    <div className="editor-layout">
      <aside className="editor-list">
        <label className="console-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a listing" /></label>
        <div>{filtered.map((asset) => <button key={asset.ticker} className={draft.ticker === asset.ticker ? "active" : ""} onClick={() => select(asset)}><span className="listing-dot">{asset.ticker.slice(0,2)}</span><span><strong>{asset.ticker}</strong><small>{asset.name}</small></span><CircleDot size={12} className={asset.active ? "live" : ""} /></button>)}</div>
      </aside>
      <section className="asset-form console-card">
        <div className="form-title"><div><span className="eyebrow">LISTING EDITOR</span><h2>{draft.ticker} · {draft.name}</h2><p>Company copy is member-visible. Price fields are intentionally not editable here.</p></div><label className="switch-label"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /><span>{draft.active ? "Active" : "Inactive"}</span></label></div>
        <div className="console-form-grid">
          <label><span>Full company name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label><span>Ticker</span><input value={draft.ticker} disabled /></label>
        </div>
        <label className="full-field"><span>Listing description</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="full-field"><span>Company overview</span><textarea className="tall" value={draft.companyDetails.overview} onChange={(event) => updateDetails("overview", event.target.value)} /></label>
        <div className="console-form-grid">
          <label><span>Developer / main shareholder</span><input value={draft.companyDetails.developer ?? ""} onChange={(event) => updateDetails("developer", event.target.value)} /></label>
          <label><span>Founded</span><input value={draft.companyDetails.founded ?? ""} onChange={(event) => updateDetails("founded", event.target.value)} /></label>
          <label><span>Headquarters</span><input value={draft.companyDetails.headquarters ?? ""} onChange={(event) => updateDetails("headquarters", event.target.value)} /></label>
          <label><span>Project URL</span><input value={draft.companyDetails.projectUrl ?? ""} onChange={(event) => updateDetails("projectUrl", event.target.value)} placeholder="https://" /></label>
        </div>
        <label className="full-field"><span>Focus areas <small>comma separated</small></span><input value={(draft.companyDetails.focus ?? []).join(", ")} onChange={(event) => setDraft({ ...draft, companyDetails: { ...draft.companyDetails, focus: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } })} /></label>
        <footer className="form-footer"><span>{saved && <><Check size={14} /> Changes saved</>}</span><button onClick={save} disabled={saving}><Save size={15} />{saving ? "Saving…" : "Save company details"}</button></footer>
      </section>
    </div>
  );
}

