import type { MarketComment } from "@joese/contracts";
import { Eye, EyeOff, Flag } from "lucide-react";

export function CommentModeration({ comments, onModerate }: { comments: MarketComment[]; onModerate: (id: string, status: MarketComment["status"]) => Promise<void> }) {
  return <section className="console-card moderation"><div className="form-title"><div><span className="eyebrow">COMMUNITY</span><h2>Comment moderation</h2><p>Visible market discussion from the member exchange.</p></div><Flag size={21} /></div><div className="moderation-list">{comments.map((comment) => <article key={comment.id}><div className="comment-identity"><span>{comment.authorName.slice(0,2).toUpperCase()}</span><div><strong>{comment.authorName}</strong><small>{comment.assetTicker} · {new Date(comment.createdAt).toLocaleString()}</small></div></div><p>{comment.body}</p><div className="moderation-actions"><span className={`status-tag ${comment.status}`}>{comment.status}</span><button onClick={() => onModerate(comment.id,"visible")}><Eye size={14} /> Show</button><button onClick={() => onModerate(comment.id,"hidden")}><EyeOff size={14} /> Hide</button><button onClick={() => onModerate(comment.id,"flagged")}><Flag size={14} /> Flag</button></div></article>)}</div></section>;
}

