import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Search, Loader2, RotateCcw } from "lucide-react";
import { ThemeToggle } from "./components/ThemeToggle";

// Components
import { TabBar, type TabId } from "./components/TabBar";
import { VitalsStrip } from "./components/VitalsStrip";
import { DnsPanel } from "./components/DnsPanel";
import { WhoisPanel, DomainExpiryPanel } from "./components/WhoisPanel";
import { SslPanel, SecurityHeadersPanel, ObservatoryPanel } from "./components/SecurityPanel";
import { TechStackPanel } from "./components/TechStackPanel";
import { WordPressPanel } from "./components/WordPressPanel";
import { IpInfoPanel, BlocklistPanel, HttpProtocolsPanel } from "./components/NetworkPanel";
import { RedirectPanel, HeadersPanel } from "./components/HttpPanel";
import { PerformancePanel, CarbonPanel } from "./components/PerformancePanel";
import { MetaPanel, RobotsDeepPanel, LlmsTxtPanel } from "./components/MetaPanel";
import { WaybackPanel, TrancoPanel, EmailAuthPanel, ScreenshotPanel } from "./components/ReputationPanels";
import { RecentLookups } from "./components/RecentLookups";
import { SkeletonPanel, SectionHeader } from "./components/Panel";
import { IpMap } from "./components/IpMap";
import { BusinessTab } from "./components/BusinessTab";
import { NewsTab } from "./components/NewsTab";
import { ExploreTab } from "./components/ExploreTab";
import { JsonLdPanel } from "./components/JsonLdPanel";
// New v2 components
import { ShodanPanel } from "./components/ShodanPanel";
import { AvailabilityPanel } from "./components/AvailabilityPanel";
import { OgPreviewPanel } from "./components/OgPreviewPanel";
import { AiReadinessPanel } from "./components/AiReadinessPanel";
import { DomainSignals, ExternalTools } from "./components/DomainSignals";
import { AIAnalysisPanel } from "./components/AIAnalysisPanel";
import { LegalPanel } from "./components/LegalPanel";
import { CurlBar, ApiTeaser } from "./components/CurlShowcase";
import { DnssecPanel, CookieSecurityPanel, CompressionPanel, HostingPanel, EmailExtrasPanel } from "./components/NewPanels";
import { BreachPanel } from "./components/BreachPanel";
import { CertTransparencyPanel, SecurityTxtPanel, GreenHostingPanel, WellKnownPanel, CaaPanel, GreynoisePanel } from "./components/Tier1Panels";
import type { AnalysisResult } from "./utils/types";

// Known false-positive e-commerce detections: WooCommerce & Magento pattern-match
// on pages that merely *mention* those names (e.g. Stripe lists them as integrations).
// Filter client-side for now; the server fingerprints will also be tightened.
const FP_ECOMMERCE_NAMES = new Set(["WooCommerce", "Magento"]);
function cleanTechStack(data: AnalysisResult): AnalysisResult {
  if (!data.tech_stack) return data;
  const hasEcommerceHeader = !!(
    data.headers?.raw?.["x-magento-vary"] ||
    data.headers?.raw?.["x-woo-version"]
  );
  if (hasEcommerceHeader) return data; // genuine signal
  const cleaned = data.tech_stack.filter(t => !FP_ECOMMERCE_NAMES.has(t.name));
  return { ...data, tech_stack: cleaned.length > 0 ? cleaned : null };
}

const sIcon = <div className="w-3.5 h-3.5 rounded" style={{ background: "var(--border)" }} />;

function SkeletonResults() {
  return (
    <div className="space-y-3 mt-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SkeletonPanel title="DNS Records" icon={sIcon} rows={6} />
        <SkeletonPanel title="WHOIS / RDAP" icon={sIcon} rows={5} />
        <SkeletonPanel title="SSL / TLS" icon={sIcon} rows={4} />
        <SkeletonPanel title="Security Headers" icon={sIcon} rows={6} />
      </div>
    </div>
  );
}

// ─── Tab Content Components ────────────────────────────────────

function OverviewTab({ data }: { data: AnalysisResult }) {
  // Quick tech stack badges
  const techBadges = (data.tech_stack ?? []).slice(0, 8);

  return (
    <div className="space-y-3">
      {/* Vitals Strip + Hosting badges */}
      <div className="space-y-2">
        <VitalsStrip data={data} />
        {data.hosting && (data.hosting.provider || data.hosting.cdn || data.hosting.waf) && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {data.hosting.provider && <span className="vital-pill"><span style={{ color: "var(--accent)", fontWeight: 500 }}>{data.hosting.provider}</span></span>}
            {data.hosting.cdn && <span className="vital-pill"><span style={{ color: "var(--success)", fontWeight: 500 }}>CDN: {data.hosting.cdn}</span></span>}
            {data.hosting.waf && <span className="vital-pill"><span style={{ color: "var(--success)", fontWeight: 500 }}>WAF: {data.hosting.waf}</span></span>}
          </div>
        )}
      </div>

      {/* Domain Signals — the main event */}
      <DomainSignals data={data} />

      {/* Quick info cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ScreenshotPanel data={data} />
        <DomainExpiryPanel data={data} />
        <TrancoPanel data={data} />
      </div>

      {/* Quick tech stack */}
      {techBadges.length > 0 && (
        <div className="panel p-3">
          <div className="flex items-center gap-2 mb-2">
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Tech Stack
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {techBadges.map((t, i) => (
              <span key={tag} className="badge badge-info" style={{ fontSize: "11px" }}>
                {t.name}{t.version ? ` ${t.version}` : ""}
              </span>
            ))}
            {(data.tech_stack?.length ?? 0) > 8 && (
              <span className="badge badge-neutral" style={{ fontSize: "10px" }}>+{(data.tech_stack?.length ?? 0) - 8} more</span>
            )}
          </div>
        </div>
      )}

      {/* Quick summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <WhoisPanel data={data} />
        {data.ip_info && <IpInfoPanel data={data} />}
      </div>

      {/* External Tools */}
      <ExternalTools data={data} />
    </div>
  );
}

function InfrastructureTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;
  const ip = data.ip_info?.ip;
  return (
    <div className="space-y-3">
      <IpMap data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <DnsPanel data={data} />
        <IpInfoPanel data={data} />
        <HostingPanel data={data} />
        <GreenHostingPanel data={data} />
        <DnssecPanel data={data} />
        <HttpProtocolsPanel data={data} />
        <CompressionPanel data={data} />
        <ShodanPanel data={data} />
        <GreynoisePanel data={data} />
        <CertTransparencyPanel data={data} />
        <RedirectPanel data={data} />
      </div>
      {/* Contextual external links */}
      <div className="flex flex-wrap gap-2 px-1">
        {ip && <a href={`https://www.shodan.io/host/${ip}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Shodan ↗</a>}
        {ip && <a href={`https://search.censys.io/hosts/${ip}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Censys ↗</a>}
        <a href={`https://dnsviz.net/d/${domain}/dnssec/`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>DNSViz ↗</a>
        <a href={`https://lookup.icann.org/en/lookup?name=${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>ICANN ↗</a>
        <a href={`https://who.is/whois/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>who.is ↗</a>
      </div>
      <SectionHeader title="Raw Headers" />
      <div className="grid grid-cols-1 gap-3">
        <HeadersPanel data={data} />
      </div>
    </div>
  );
}

function SecurityTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;
  return (
    <div className="space-y-3">
      {/* Breach panel at the top — most impactful */}
      <BreachPanel data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SslPanel data={data} />
        <SecurityHeadersPanel data={data} />
        <DnssecPanel data={data} />
        <ObservatoryPanel data={data} />
        <SecurityTxtPanel data={data} />
        <CaaPanel data={data} />
        <EmailAuthPanel data={data} />
        <EmailExtrasPanel data={data} />
        <CookieSecurityPanel data={data} />
        <BlocklistPanel data={data} />
      </div>
      {/* Contextual external links */}
      <div className="flex flex-wrap gap-2 px-1">
        <a href={`https://securityheaders.com/?q=${domain}&followRedirects=on`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>SecurityHeaders ↗</a>
        <a href={`https://observatory.mozilla.org/analyze/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Observatory ↗</a>
        <a href={`https://www.ssllabs.com/ssltest/analyze.html?d=${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>SSL Labs ↗</a>
        <a href={`https://www.virustotal.com/gui/domain/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>VirusTotal ↗</a>
        <a href={`https://transparencyreport.google.com/safe-browsing/search?url=${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Safe Browsing ↗</a>
        <a href={`https://mxtoolbox.com/SuperTool.aspx?action=mx%3a${domain}&run=toolpage`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>MXToolbox ↗</a>
      </div>
    </div>
  );
}

function TechTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TechStackPanel data={data} />
        {data.wordpress && <WordPressPanel data={data} />}
        <MetaPanel data={data} />
        <JsonLdPanel data={data} />
        <RobotsDeepPanel data={data} />
        <LlmsTxtPanel data={data} />
        <WellKnownPanel data={data} />
      </div>
      <div className="flex flex-wrap gap-2 px-1">
        <a href={`https://builtwith.com/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>BuiltWith ↗</a>
        <a href={`https://www.wappalyzer.com/lookup/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Wappalyzer ↗</a>
      </div>
    </div>
  );
}

function PerformanceTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PerformancePanel data={data} />
        <CompressionPanel data={data} />
        <CarbonPanel data={data} />
        <WaybackPanel data={data} />
      </div>
      <div className="flex flex-wrap gap-2 px-1">
        <a href={`https://pagespeed.web.dev/analysis?url=https://${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>PageSpeed Insights ↗</a>
        <a href={`https://gtmetrix.com/?url=https://${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>GTmetrix ↗</a>
        <a href={`https://web.archive.org/web/*/https://${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Wayback Machine ↗</a>
      </div>
    </div>
  );
}

function BusinessTabWrapper({ data }: { data: AnalysisResult }) {
  return (
    <div className="space-y-3">
      <BusinessTab domain={data.domain} />
      <SectionHeader title="Social Sharing" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <OgPreviewPanel data={data} />
        <LegalPanel data={data} />
      </div>
      <SectionHeader title="Registration" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <WhoisPanel data={data} />
      </div>
    </div>
  );
}

// ─── Main Tab Renderer ─────────────────────────────────────────

function TabContent({ tab, data, onNavigate }: { tab: TabId; data: AnalysisResult; onNavigate: (d: string) => void }) {
  switch (tab) {
    case "overview": return <OverviewTab data={data} />;
    case "infrastructure": return <InfrastructureTab data={data} />;
    case "security": return <SecurityTab data={data} />;
    case "tech": return <TechTab data={data} />;
    case "performance": return <PerformanceTab data={data} />;
    case "business": return <BusinessTabWrapper data={data} />;
    case "news": return <NewsTab domain={data.domain} />;
    case "explore": return <ExploreTab domain={data.domain} data={data} onNavigate={onNavigate} />;
    case "ai": return <AIAnalysisPanel domain={data.domain} />;
    default: return null;
  }
}

// ─── Main App ──────────────────────────────────────────────────

export function App() {
  const [domain, setDomain] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [autoLoaded, setAutoLoaded] = useState(false);
  const queryClient = useQueryClient();

  const recentLookups = useQuery({
    queryKey: ["recentLookups"],
    queryFn: () => api.getRecentLookups({ limit: 8 }),
  });

  const analyze = useMutation({
    mutationFn: (d: string) => api.analyzeDomain({ domain: d }),
    onSuccess: (_data, d) => {
      queryClient.invalidateQueries({ queryKey: ["recentLookups"] });
      // Sync URL to match the analyzed domain
      const clean = d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
      if (clean && window.location.pathname !== `/${clean}`) {
        window.history.pushState(null, "", `/${clean}`);
      }
      document.title = `${clean} — Yoke`;
    },
  });

  const doAnalyze = useCallback(() => {
    const d = domain.trim();
    if (!d || analyze.isPending) return;
    setActiveTab("overview");
    analyze.mutate(d);
  }, [domain, analyze]);

  const handleNavigate = useCallback(
    (d: string) => {
      setDomain(d);
      setActiveTab("overview");
      analyze.mutate(d);
    },
    [analyze],
  );

  // URL-based routing: yoke.lol/cloudflare.com → auto-analyze
  useEffect(() => {
    if (autoLoaded) return;
    const path = window.location.pathname.slice(1); // strip leading /
    if (path && path.includes(".") && !path.startsWith("api/") && !path.startsWith("assets/")) {
      // URL has a domain in it — analyze it
      setAutoLoaded(true);
      setDomain(path);
      analyze.mutate(path);
      return;
    }
    // No domain in URL — fall back to most recent lookup
    if (!recentLookups.data?.lookups?.length) return;
    const mostRecent = recentLookups.data.lookups[0];
    if (mostRecent) {
      setAutoLoaded(true);
      setDomain(mostRecent.domain);
      analyze.mutate(mostRecent.domain);
    }
  }, [recentLookups.data, autoLoaded, analyze]);

  // Handle browser back/forward
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname.slice(1);
      if (path && path.includes(".")) {
        setDomain(path);
        setActiveTab("overview");
        analyze.mutate(path);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [analyze]);

  return (
    <main className="min-h-screen pb-12" style={{ background: "var(--bg)" }}>
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <h1 style={{ fontFamily: "var(--font-ui)", fontSize: "20px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Yoke
          </h1>
          <div className="h-4 w-px" style={{ background: "var(--border)" }} />
          <span style={{ fontFamily: "var(--font-ui)", fontSize: "13px", color: "var(--dim)" }}>
            Domain Intelligence
          </span>
          <div className="flex-1" />
          <ThemeToggle />
        </div>

        {/* Search Bar */}
        <div className="mb-0">
          <div className="search-glow flex items-center rounded-lg" style={{ background: "var(--surface)" }}>
            <div className="pl-4" style={{ color: "var(--dim)" }}>
              <Search size={16} />
            </div>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doAnalyze(); } }}
              placeholder="Enter domain name (e.g. example.com)"
              className="flex-1 bg-transparent px-3 py-3 outline-none"
              style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text)" }}
              aria-label="Domain name"
              disabled={analyze.isPending}
            />
            <button
              type="button"
              onClick={() => doAnalyze()}
              disabled={analyze.isPending || !domain.trim()}
              className="flex items-center gap-2 px-5 py-2 mr-1.5 rounded-md transition-all disabled:opacity-30"
              style={{
                background: "var(--accent)",
                color: "var(--accent-fg)",
                fontFamily: "var(--font-ui)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: analyze.isPending || !domain.trim() ? "default" : "pointer",
                border: "none",
              }}
              aria-label="Analyze domain"
            >
              {analyze.isPending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {analyze.isPending ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        </div>

        {/* Tab Bar - shown when we have results or are loading */}
        {(analyze.data || analyze.isPending) && (
          <div className="mt-3 mb-3 sticky top-0 z-10" style={{ background: "var(--bg)" }}>
            <TabBar active={activeTab} onChange={setActiveTab} />
          </div>
        )}

        {/* Recent lookups */}
        {recentLookups.data && recentLookups.data.lookups.length > 0 && !analyze.data && !analyze.isPending && (
          <div className="mt-5 mb-6">
            <RecentLookups lookups={recentLookups.data.lookups} onSelect={handleNavigate} />
          </div>
        )}

        {/* Error state */}
        {analyze.error && (
          <div className="panel p-4 mb-4 flex items-center gap-3 mt-3" style={{ borderColor: "var(--danger)" }}>
            <span style={{ color: "var(--danger)", fontFamily: "var(--font-ui)", fontSize: "13px" }}>
              Analysis failed: {String(analyze.error)}
            </span>
            <button
              onClick={() => doAnalyze()}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md"
              style={{ background: "var(--danger-subtle)", border: "1px solid rgba(248, 81, 73, 0.25)", color: "var(--danger)", fontFamily: "var(--font-ui)", fontSize: "12px", cursor: "pointer" }}
              aria-label="Retry analysis"
            >
              <RotateCcw size={11} /> Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {analyze.isPending && <SkeletonResults />}

        {/* Results */}
        {analyze.data && !analyze.isPending && (
          <div className="mt-0">
            {/* Curl API showcase bar */}
            <div className="mb-3">
              <CurlBar domain={analyze.data.domain} activeTab={activeTab} />
            </div>
            <TabContent tab={activeTab} data={cleanTechStack(analyze.data)} onNavigate={handleNavigate} />
          </div>
        )}

        {/* Empty state */}
        {!analyze.data && !analyze.isPending && !analyze.error && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <Search size={28} style={{ color: "var(--accent)", opacity: 0.4 }} />
            </div>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: "14px", color: "var(--dim)", textAlign: "center", maxWidth: "420px", lineHeight: "22px" }}>
              Enter a domain to explore DNS records, SSL certificates, security headers, tech stack, performance metrics, company data, news, and more — across 9 intelligence tabs.
            </p>
            <ApiTeaser />
          </div>
        )}

        {/* Cached indicator */}
        {analyze.data?.cached && (
          <div className="mt-4 text-center">
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)" }}>
              ● Cached result from {new Date(analyze.data.analyzed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid var(--border)",
        padding: "1rem 0",
        marginTop: "3rem",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "1.25rem",
        fontFamily: "var(--font-ui)",
        fontSize: "12px",
        color: "var(--dim)",
      }}>
        <a
          href="https://github.com/kurtpayne/yoke"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--dim)", textDecoration: "none", display: "flex", alignItems: "center", gap: "0.35rem", transition: "color 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          GitHub
        </a>
        <span style={{ color: "var(--border)" }}>·</span>
        <a
          href="https://yoke.canny.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--dim)", textDecoration: "none", transition: "color 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          Feedback
        </a>
        <span style={{ color: "var(--border)" }}>·</span>
        <a
          href="/api/docs"
          style={{ color: "var(--dim)", textDecoration: "none", transition: "color 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          API
        </a>
        <span style={{ color: "var(--border)" }}>·</span>
        <a
          href="/privacy"
          style={{ color: "var(--dim)", textDecoration: "none", transition: "color 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          Privacy
        </a>
        <span style={{ color: "var(--border)" }}>·</span>
        <a
          href="/terms"
          style={{ color: "var(--dim)", textDecoration: "none", transition: "color 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          Terms
        </a>
        <span style={{ color: "var(--border)" }}>·</span>
        <a
          href="https://chromewebstore.google.com/detail/yoke/fghkhjlelidaepapcdfjifnlcjmkgpcj"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--dim)", textDecoration: "none", transition: "color 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
        >
          Chrome Extension
        </a>
      </footer>
    </main>
  );
}
