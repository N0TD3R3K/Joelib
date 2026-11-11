import type { PortfolioSnapshot, UserPreferences } from "@joese/contracts";
import { ArrowLeft, Check, Palette, UserRound } from "lucide-react";
import { useState } from "react";

interface Props {
  portfolio: PortfolioSnapshot;
  onBack: () => void;
  onSave: (username: string, preferences: UserPreferences) => Promise<void>;
}

export function SettingsPage({ portfolio, onBack, onSave }: Props) {
  const [username, setUsername] = useState(portfolio.summary.username);
  const [growthColor, setGrowthColor] = useState(portfolio.summary.preferences.growthColor);
  const [fallColor, setFallColor] = useState(portfolio.summary.preferences.fallColor);
  const [compactNumbers, setCompactNumbers] = useState(portfolio.summary.preferences.compactNumbers);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    await onSave(username, { growthColor, fallColor, compactNumbers });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };
  return (
    <div className="settings-page">
      <header className="settings-header"><button onClick={onBack}><ArrowLeft size={18} /> Back to exchange</button><div className="brand-lockup"><span className="brand-gem">J</span><strong>JOESE</strong></div></header>
      <main className="settings-shell">
        <div className="settings-title"><span className="eyebrow">PERSONAL ACCOUNT</span><h1>Settings</h1><p>Control how your JOESE account and market colors appear.</p></div>
        <section className="settings-card">
          <div className="settings-card-title"><UserRound size={20} /><div><h2>Profile</h2><p>Your visible JOESE identity</p></div></div>
          <label className="form-field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label className="form-field"><span>Verified school email</span><input value={portfolio.summary.email} disabled /><small>Email changes require administrator review.</small></label>
        </section>
        <section className="settings-card">
          <div className="settings-card-title"><Palette size={20} /><div><h2>Market colors</h2><p>Choose the colors used for growth and fall</p></div></div>
          <div className="color-setting-grid">
            <label><span>Growth</span><div className="color-input"><input type="color" value={growthColor} onChange={(event) => setGrowthColor(event.target.value)} /><code>{growthColor}</code></div><div className="color-preview" style={{ color: growthColor }}>+4.28%</div></label>
            <label><span>Fall</span><div className="color-input"><input type="color" value={fallColor} onChange={(event) => setFallColor(event.target.value)} /><code>{fallColor}</code></div><div className="color-preview" style={{ color: fallColor }}>−2.15%</div></label>
          </div>
          <label className="toggle-row"><span><strong>Compact large numbers</strong><small>Display J$12.4K instead of J$12,400.00</small></span><input type="checkbox" checked={compactNumbers} onChange={(event) => setCompactNumbers(event.target.checked)} /></label>
        </section>
        <button className="save-settings" onClick={save}>{saved ? <><Check size={18} /> Saved</> : "Save settings"}</button>
      </main>
    </div>
  );
}

