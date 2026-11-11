import { FileClock } from "lucide-react";

export function AuditLog({ rows }: { rows: Record<string, unknown>[] }) {
  return <section className="console-card audit"><div className="form-title"><div><span className="eyebrow">IMMUTABLE HISTORY</span><h2>Audit log</h2><p>Attributed operations events and configuration changes.</p></div><FileClock size={21}/></div><div className="audit-list">{rows.map((row) => <article key={String(row.id)}><div className="audit-marker"></div><div><strong>{String(row.action)}</strong><p>{String(row.actor_name ?? "System")} · {String(row.target_type)} · {String(row.target_id ?? "")}</p></div><time>{new Date(String(row.created_at)).toLocaleString()}</time></article>)}</div></section>;
}

