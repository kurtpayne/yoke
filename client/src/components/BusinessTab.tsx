import { useQuery } from "@tanstack/react-query";
import { Building2, TrendingUp, TrendingDown, ExternalLink, Globe } from "lucide-react";
import { api } from "../api";
import { Panel, DataRow, StatusBadge, ErrorState } from "./Panel";
import { Tooltip } from "./Tooltip";
import type { CompanyInfoResult } from "../utils/types";

function formatMarketCap(mc: number | null): string {
  if (mc == null) return "—";
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(1)}M`;
  return `$${mc.toLocaleString()}`;
}

function formatRevenue(r: string | null): string {
  if (!r) return "—";
  const n = parseFloat(r);
  if (isNaN(n)) return r;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function CompanyCard({ company, crunchbaseUrl }: { company: NonNullable<CompanyInfoResult["company"]>; crunchbaseUrl: string | null }) {
  const sourceBadge = company.source === "wikidata" && company.wikidata_id
    ? <a href={`https://www.wikidata.org/wiki/${company.wikidata_id}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><StatusBadge status="info" label="Wikidata" /></a>
    : company.source === "brandfetch"
    ? <StatusBadge status="info" label="Brandfetch" />
    : null;

  return (
    <Panel
      title="Company Info"
      icon={<Building2 size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {sourceBadge}
          {crunchbaseUrl && (
            <a
              href={crunchbaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors"
              style={{
                fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 600,
                color: "var(--accent)", textDecoration: "none",
                border: "1px solid var(--border-muted)",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-subtle)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <ExternalLink size={9} />
              Crunchbase
            </a>
          )}
        </div>
      }
    >
      {/* Company logo + name header */}
      {company.name && (
        <div className="px-4 pt-3 pb-2 flex items-center gap-3">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name ?? "Company logo"}
              style={{ width: 36, height: 36, borderRadius: 6, objectFit: "contain", background: "var(--bg)" }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-ui)", fontSize: "16px", fontWeight: 700, color: "var(--accent)" }}>
              {company.name.charAt(0).toUpperCase()}
            </div>
          )}
          {company.name && (
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "16px", fontWeight: 600, color: "var(--text)" }}>
              {company.name}
            </span>
          )}
        </div>
      )}

      {company.description && <DataRow label="Description" value={<span style={{ fontSize: "11px" }}>{company.description}</span>} mono={false} copyValue={company.description} />}
      {company.founded && <DataRow label="Founded" value={company.founded} />}
      {company.ceo && <DataRow label="CEO" value={company.ceo} mono={false} />}
      {company.hq && <DataRow label="Headquarters" value={company.hq} mono={false} />}
      {company.industry && <DataRow label="Industry" value={company.industry} mono={false} />}
      {company.employees != null && <DataRow label="Employees" value={company.employees.toLocaleString()} />}
      {company.parent_org && <DataRow label="Parent Org" value={company.parent_org} mono={false} />}
      {company.revenue && <DataRow label="Revenue" value={formatRevenue(company.revenue)} />}
      {company.exchange && <DataRow label="Stock Exchange" value={company.exchange} mono={false} />}
      {company.ticker && <DataRow label="Ticker" value={company.ticker} />}

      {/* Social Links */}
      {company.social_links && company.social_links.length > 0 && (
        <>
          <div className="sub-section">Social Profiles</div>
          <div className="px-4 py-2 flex flex-wrap gap-2">
            {company.social_links.map((link, i) => (
              <a
                key={`biz-${i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded px-2 py-1 transition-colors"
                style={{
                  fontFamily: "var(--font-ui)", fontSize: "11px",
                  color: "var(--accent)", textDecoration: "none",
                  border: "1px solid var(--border-muted)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--accent-subtle)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <Globe size={10} style={{ opacity: 0.6 }} />
                {link.platform}
              </a>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const w = 200, h = 40, pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const color = positive ? "var(--success)" : "var(--danger)";
  // Build fill polygon: line points + bottom-right + bottom-left
  const firstX = pad, lastX = pad + (w - pad * 2);
  const fillPoints = `${points} ${lastX.toFixed(1)},${h} ${firstX.toFixed(1)},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: 200, height: 40, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`spark-fill-${positive ? "up" : "dn"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#spark-fill-${positive ? "up" : "dn"})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StockCard({ stock, ticker }: { stock: NonNullable<CompanyInfoResult["stock"]>; ticker: string }) {
  const isPositive = (stock.change ?? 0) >= 0;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Panel title={`${ticker} Stock`} icon={<Icon size={14} />} badge={<span style={{ fontSize: "10px", color: "var(--dim)", fontStyle: "italic" }}>via Yahoo Finance</span>}>
      <div className="p-4">
        <div className="flex items-baseline gap-3 mb-4">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "32px", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
            {stock.currency === "USD" ? "$" : ""}{stock.price?.toFixed(2) ?? "—"}
          </span>
          {stock.change != null && (
            <div className="flex items-center gap-1.5">
              <Icon size={14} className={isPositive ? "stock-positive" : "stock-negative"} style={{ color: isPositive ? "var(--success)" : "var(--danger)" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 600, color: isPositive ? "var(--success)" : "var(--danger)" }}>
                {isPositive ? "+" : ""}{stock.change.toFixed(2)} ({isPositive ? "+" : ""}{stock.change_percent?.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        {stock.sparkline && stock.sparkline.length >= 2 && (
          <div className="mb-3">
            <Sparkline data={stock.sparkline} positive={isPositive} />
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "9px", color: "var(--dim)", marginTop: 2, display: "block" }}>5-day</span>
          </div>
        )}
        <div className="space-y-0">
          {stock.market_cap != null && (
            <DataRow
              label={<span className="flex items-center gap-1">Market Cap <Tooltip text="Total value of all outstanding shares. Calculated as share price × total shares." help /></span>}
              value={formatMarketCap(stock.market_cap)}
            />
          )}
          {stock.volume != null && (
            <DataRow
              label={<span className="flex items-center gap-1">Volume <Tooltip text="Number of shares traded today" help /></span>}
              value={stock.volume.toLocaleString()}
            />
          )}
          {stock.high_52w != null && (
            <DataRow
              label={<span className="flex items-center gap-1">52W High <Tooltip text="Highest price in the last 52 weeks" help /></span>}
              value={`$${stock.high_52w.toFixed(2)}`}
            />
          )}
          {stock.low_52w != null && (
            <DataRow
              label={<span className="flex items-center gap-1">52W Low <Tooltip text="Lowest price in the last 52 weeks" help /></span>}
              value={`$${stock.low_52w.toFixed(2)}`}
            />
          )}
          {stock.currency && <DataRow label="Currency" value={stock.currency} />}
        </div>
      </div>
    </Panel>
  );
}

export function BusinessTab({ domain }: { domain: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ["companyInfo", domain],
    queryFn: () => api.getCompanyInfo({ domain }),
    enabled: !!domain,
  });

  if (isPending) return (
    <div className="space-y-3">
      <div className="panel p-6 text-center"><span style={{ color: "var(--dim)", fontSize: "13px" }}>Loading company data...</span></div>
    </div>
  );
  if (error) return <ErrorState message={`Failed to load company info: ${String(error)}`} />;

  const hasCompany = !!data?.company?.name;
  const hasStock = !!data?.stock?.price;

  if (!hasCompany && !hasStock) {
    return (
      <div className="panel p-8 text-center">
        <Building2 size={24} style={{ color: "var(--dim)", opacity: 0.4, margin: "0 auto 12px" }} />
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "13px", color: "var(--dim)" }}>
          No company information found for this domain.
        </p>
        <p style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", marginTop: "6px", opacity: 0.7 }}>
          Company data is sourced from Wikidata and Brandfetch.
        </p>
        {data?.crunchbase_url && (
          <a
            href={data.crunchbase_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 rounded px-3 py-1.5 transition-colors"
            style={{
              fontFamily: "var(--font-ui)", fontSize: "12px",
              color: "var(--accent)", textDecoration: "none",
              border: "1px solid var(--border-muted)",
            }}
          >
            <ExternalLink size={11} />
            Try Crunchbase →
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {data?.company && <CompanyCard company={data.company} crunchbaseUrl={data?.crunchbase_url ?? null} />}
        {data?.stock && data.company?.ticker && <StockCard stock={data.stock} ticker={data.company.ticker} />}
      </div>
      <p style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", textAlign: "center", marginTop: "12px", opacity: 0.7 }}>
        Company data sourced from public databases and may not reflect current information.
      </p>
    </div>
  );
}
