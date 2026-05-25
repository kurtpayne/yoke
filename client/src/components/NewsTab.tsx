import { useQuery } from "@tanstack/react-query";
import { Newspaper, MessageSquare, ExternalLink, ThumbsUp, Share2 } from "lucide-react";
import { api } from "../api";
import { Panel, StatusBadge, ErrorState } from "./Panel";
import type { NewsResult } from "../utils/types";

function timeAgo(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  } catch { return dateStr; }
}

function GoogleNewsPanel({ items }: { items: NewsResult["google_news"] }) {
  if (items.length === 0) return (
    <Panel title="Google News" icon={<Newspaper size={14} />}>
      <div className="p-4"><StatusBadge status="neutral" label="No news articles found" /></div>
    </Panel>
  );
  return (
    <Panel title="Google News" icon={<Newspaper size={14} />} badge={<StatusBadge status="info" label={`${items.length} articles`} />}>
      {items.map((item, i) => (
        <a key={item.link} href={item.link} target="_blank" rel="noopener noreferrer" className="news-item block" style={{ textDecoration: "none" }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p style={{ fontFamily: "var(--font-ui)", fontSize: "13px", color: "var(--text)", lineHeight: "20px", fontWeight: 500, margin: 0 }}>
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {item.source && <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--accent)" }}>{item.source}</span>}
                {item.pub_date && <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)" }}>{timeAgo(item.pub_date)}</span>}
              </div>
            </div>
            <ExternalLink size={12} style={{ color: "var(--dim)", flexShrink: 0, marginTop: "4px" }} />
          </div>
        </a>
      ))}
    </Panel>
  );
}

function HackerNewsPanel({ items, domain }: { items: NewsResult["hacker_news"]; domain: string }) {
  if (items.length === 0) return (
    <Panel title="Hacker News" icon={<MessageSquare size={14} />}>
      <div className="p-4"><StatusBadge status="neutral" label="No HN discussions found" /></div>
    </Panel>
  );
  return (
    <Panel title="Hacker News" icon={<MessageSquare size={14} />} badge={<StatusBadge status="info" label={`${items.length} stories`} />}>
      {items.map((item, i) => (
        <a key={`hn-${i}`} href={item.url ?? `https://hn.algolia.com/?q=${encodeURIComponent(domain)}`} target="_blank" rel="noopener noreferrer" className="news-item block" style={{ textDecoration: "none" }}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p style={{ fontFamily: "var(--font-ui)", fontSize: "13px", color: "var(--text)", lineHeight: "20px", fontWeight: 500, margin: 0 }}>
                {item.title}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--warning)" }}>
                  <ThumbsUp size={10} /> {item.points}
                </span>
                <span className="flex items-center gap-1" style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--dim)" }}>
                  <MessageSquare size={10} /> {item.num_comments}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)" }}>{timeAgo(item.created_at)}</span>
              </div>
            </div>
            <ExternalLink size={12} style={{ color: "var(--dim)", flexShrink: 0, marginTop: "4px" }} />
          </div>
        </a>
      ))}
    </Panel>
  );
}

function SocialAccountsPanel({ domain }: { domain: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["socialAccounts", domain],
    queryFn: () => api.getSocialAccounts({ domain }),
    enabled: !!domain,
  });

  if (isPending) return (
    <Panel title="Social Accounts" icon={<Share2 size={14} />}>
      <div className="p-4"><span style={{ color: "var(--dim)", fontSize: "12px" }}>Discovering social accounts...</span></div>
    </Panel>
  );

  const accounts = data?.accounts ?? [];

  return (
    <Panel title="Social Accounts" icon={<Share2 size={14} />} badge={accounts.length > 0 ? <StatusBadge status="pass" label={`${accounts.length} found`} /> : undefined}>
      {accounts.length === 0 ? (
        <div className="p-4"><StatusBadge status="neutral" label="No social accounts found" /></div>
      ) : (
        <div className="p-3 flex flex-wrap gap-2">
          {accounts.map((acc, i) => (
            <a key={acc.url} href={acc.url} target="_blank" rel="noopener noreferrer" className="social-badge">
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--success)" }} />
              <span style={{ fontWeight: 600, fontSize: "11px" }}>{acc.platform}</span>
              {acc.username && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)" }}>@{acc.username}</span>
              )}
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function NewsTab({ domain }: { domain: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ["news", domain],
    queryFn: () => api.getNews({ domain }),
    enabled: !!domain,
  });

  return (
    <div className="space-y-3">
      {isPending ? (
        <div className="panel p-6 text-center">
          <span style={{ color: "var(--dim)", fontSize: "13px" }}>Fetching news and social data...</span>
        </div>
      ) : error ? (
        <ErrorState message={`Failed to load news: ${String(error)}`} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <GoogleNewsPanel items={data?.google_news ?? []} />
          <HackerNewsPanel items={data?.hacker_news ?? []} domain={domain} />
        </div>
      )}
      <SocialAccountsPanel domain={domain} />
    </div>
  );
}
