import type { MarketComment, NewsEvent } from "@joese/contracts";
import { timeAgo } from "@joese/ui";
import { ArrowUpRight, MessageSquare, Newspaper, Send } from "lucide-react";
import { useMemo, useState } from "react";

interface Props {
  ticker: string;
  news: NewsEvent[];
  comments: MarketComment[];
  onComment: (body: string) => Promise<void>;
}

export function NewsAndComments({ ticker, news, comments, onComment }: Props) {
  const [tab, setTab] = useState<"news" | "comments">("news");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const relevantNews = useMemo(() => news.filter((item) => item.affectedTickers.includes(ticker)), [news, ticker]);
  const relevantComments = useMemo(() => comments.filter((item) => item.assetTicker === ticker), [comments, ticker]);

  const submit = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await onComment(body.trim());
      setBody("");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="feed-card">
      <div className="section-heading feed-heading">
        <div><span className="eyebrow">MARKET PULSE</span><h2>News & discussion</h2></div>
        <div className="segmented compact">
          <button className={tab === "news" ? "active" : ""} onClick={() => setTab("news")}><Newspaper size={14} /> News</button>
          <button className={tab === "comments" ? "active" : ""} onClick={() => setTab("comments")}><MessageSquare size={14} /> Comments</button>
        </div>
      </div>
      {tab === "news" ? (
        <div className="news-list">
          {(relevantNews.length ? relevantNews : news.slice(0, 2)).map((item) => (
            <article className="news-item" key={item.id}>
              <div className={`news-impact ${item.direction}`}><span>{item.severity}</span></div>
              <div>
                <div className="news-meta"><span>THE JOE WIRE</span><time>{timeAgo(item.publishedAt)}</time></div>
                <h3>{item.headline}</h3>
                <p>{item.article}</p>
                <div className="news-tags">{item.affectedTickers.map((affected) => <span key={affected}>{affected}</span>)}<ArrowUpRight size={15} /></div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="comments-panel">
          <div className="comment-composer">
            <div className="mini-avatar">JI</div>
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={`Share a thought about ${ticker}…`} maxLength={1000} />
            <button onClick={submit} disabled={sending || !body.trim()} aria-label="Post comment"><Send size={17} /></button>
          </div>
          <div className="comment-list">
            {relevantComments.length === 0 && <div className="empty-note">No comments yet. Start the discussion.</div>}
            {relevantComments.map((comment) => (
              <article className="comment" key={comment.id}>
                <div className="mini-avatar">{comment.authorName.slice(0, 2).toUpperCase()}</div>
                <div><div className="comment-author"><strong>{comment.authorName}</strong><span>{timeAgo(comment.createdAt)}</span></div><p>{comment.body}</p></div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

