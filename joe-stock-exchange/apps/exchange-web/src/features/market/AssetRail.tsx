import type { Asset } from "@joese/contracts";
import { formatJoellars, formatPercent } from "@joese/ui";
import { Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

interface Props {
  assets: Asset[];
  selectedTicker: string;
  onSelect: (ticker: string) => void;
}

export function AssetRail({ assets, selectedTicker, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? assets.filter((asset) => asset.ticker.toLowerCase().includes(normalized) || asset.name.toLowerCase().includes(normalized))
      : assets;
  }, [assets, query]);

  const renderGroup = (label: string, type: Asset["type"]) => (
    <section className="asset-group">
      <div className="rail-section-title">
        <span>{label}</span>
        <span>{visible.filter((asset) => asset.type === type).length}</span>
      </div>
      <div className="asset-list">
        {visible.filter((asset) => asset.type === type).map((asset) => {
          const isUp = asset.percentChange >= 0;
          return (
            <button
              className={`asset-row ${selectedTicker === asset.ticker ? "is-selected" : ""}`}
              key={asset.ticker}
              onClick={() => onSelect(asset.ticker)}
              type="button"
            >
              <span className="asset-monogram">{asset.ticker.slice(0, 2)}</span>
              <span className="asset-identity">
                <strong>{asset.ticker}</strong>
                <small>{asset.name}</small>
              </span>
              <span className="asset-quote">
                <strong>{formatJoellars(asset.currentPriceCents)}</strong>
                <small className={isUp ? "positive" : "negative"}>{formatPercent(asset.percentChange)}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <aside className="asset-rail">
      <div className="rail-intro">
        <div className="rail-intro-icon"><Sparkles size={15} /></div>
        <div><strong>Joe Universe</strong><small>Official listings</small></div>
      </div>
      <label className="search-box">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search listings" aria-label="Search listings" />
        <kbd>/</kbd>
      </label>
      {renderGroup("Equities", "stock")}
      {renderGroup("Crypto", "crypto")}
      <div className="rail-disclaimer">Fictional market · J$ has no cash value</div>
    </aside>
  );
}

