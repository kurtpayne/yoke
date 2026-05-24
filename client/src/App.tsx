import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Search, Loader2, RotateCcw } from "lucide-react";
import { ThemeToggle } from "./components/ThemeToggle";
import { PanelGrid, ResetLayoutButton, type PanelDef } from "./components/PanelLayout";

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
import { ErrorBoundary } from "./components/ErrorBoundary";

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

  const quickInfoPanels: PanelDef[] = [
    { id: "screenshot", node: <ScreenshotPanel data={data} /> },
    { id: "domain-expiry", node: <DomainExpiryPanel data={data} /> },
    { id: "tranco", node: <TrancoPanel data={data} /> },
  ];

  const summaryPanels: PanelDef[] = [
    { id: "whois", node: <WhoisPanel data={data} /> },
    ...(data.ip_info ? [{ id: "ip-info", node: <IpInfoPanel data={data} /> }] : []),
  ];

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
      <PanelGrid tabId="overview-quick" panels={quickInfoPanels} />

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
              <span key={t.name} className="badge badge-info" style={{ fontSize: "11px" }}>
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
      <PanelGrid tabId="overview-summary" panels={summaryPanels} />

      {/* External Tools */}
      <ExternalTools data={data} />
    </div>
  );
}

function InfrastructureTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;
  const ip = data.ip_info?.ip;

  const panels: PanelDef[] = [
    { id: "ip-map", node: <IpMap data={data} />, fullWidth: true },
    { id: "dns", node: <DnsPanel data={data} /> },
    { id: "ip-info", node: <IpInfoPanel data={data} /> },
    { id: "hosting", node: <HostingPanel data={data} /> },
    { id: "green-hosting", node: <GreenHostingPanel data={data} /> },
    { id: "dnssec", node: <DnssecPanel data={data} /> },
    { id: "http-protocols", node: <HttpProtocolsPanel data={data} /> },
    { id: "compression", node: <CompressionPanel data={data} /> },
    { id: "shodan", node: <ShodanPanel data={data} /> },
    { id: "greynoise", node: <GreynoisePanel data={data} /> },
    { id: "cert-transparency", node: <CertTransparencyPanel data={data} /> },
    { id: "redirects", node: <RedirectPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <PanelGrid tabId="infrastructure" panels={panels} />
      {/* Contextual external links */}
      <div className="flex flex-wrap gap-2 px-1">
        {ip && <a href={`https://www.shodan.io/host/${ip}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Shodan ↗</a>}
        {ip && <a href={`https://search.censys.io/hosts/${ip}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Censys ↗</a>}
        <a href={`https://dnsviz.net/d/${domain}/dnssec/`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>DNSViz ↗</a>
        <a href={`https://lookup.icann.org/en/lookup?name=${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>ICANN ↗</a>
        <a href={`https://who.is/whois/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>who.is ↗</a>
      </div>
      <SectionHeader title="Raw Headers" />
      <PanelGrid tabId="infrastructure-headers" panels={[
        { id: "headers", node: <HeadersPanel data={data} /> },
      ]} grid={false} />
    </div>
  );
}

function SecurityTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;

  const panels: PanelDef[] = [
    { id: "breaches", node: <BreachPanel data={data} />, fullWidth: true },
    { id: "ssl", node: <SslPanel data={data} /> },
    { id: "security-headers", node: <SecurityHeadersPanel data={data} /> },
    { id: "observatory", node: <ObservatoryPanel data={data} /> },
    { id: "email-auth", node: <EmailAuthPanel data={data} /> },
    { id: "cookie-security", node: <CookieSecurityPanel data={data} /> },
    { id: "security-txt", node: <SecurityTxtPanel data={data} /> },
    { id: "caa", node: <CaaPanel data={data} /> },
    { id: "availability", node: <AvailabilityPanel data={data} /> },
    { id: "ai-readiness", node: <AiReadinessPanel data={data} /> },
    { id: "blocklist", node: <BlocklistPanel data={data} /> },
    { id: "email-extras", node: <EmailExtrasPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <PanelGrid tabId="security" panels={panels} />
      <div className="flex flex-wrap gap-2 px-1">
        <a href={`https://observatory.mozilla.org/analyze/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Observatory ↗</a>
        <a href={`https://securityheaders.com/?q=${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>SecurityHeaders.com ↗</a>
        <a href={`https://haveibeenpwned.com/DomainSearch/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>HIBP ↗</a>
      </div>
    </div>
  );
}

function TechTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;

  const panels: PanelDef[] = [
    { id: "tech-stack", node: <TechStackPanel data={data} /> },
    { id: "wordpress", node: <WordPressPanel data={data} />, visible: !!data.wordpress },
    { id: "meta", node: <MetaPanel data={data} /> },
    { id: "json-ld", node: <JsonLdPanel data={data} /> },
    { id: "robots", node: <RobotsDeepPanel data={data} /> },
    { id: "llms-txt", node: <LlmsTxtPanel data={data} /> },
    { id: "well-known", node: <WellKnownPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <PanelGrid tabId="tech" panels={panels} />
      <div className="flex flex-wrap gap-2 px-1">
        <a href={`https://builtwith.com/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>BuiltWith ↗</a>
        <a href={`https://www.wappalyzer.com/lookup/${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Wappalyzer ↗</a>
        <a href={`https://search.google.com/test/rich-results?url=https://${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Rich Results Test ↗</a>
      </div>
    </div>
  );
}

function PerformanceTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;

  const panels: PanelDef[] = [
    { id: "pagespeed", node: <PerformancePanel data={data} /> },
    { id: "compression", node: <CompressionPanel data={data} /> },
    { id: "carbon", node: <CarbonPanel data={data} /> },
    { id: "wayback", node: <WaybackPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <PanelGrid tabId="performance" panels={panels} />
      <div className="flex flex-wrap gap-2 px-1">
        <a href={`https://pagespeed.web.dev/analysis?url=https://${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>PageSpeed Insights ↗</a>
        <a href={`https://www.webpagetest.org/?url=https://${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>WebPageTest ↗</a>
        <a href={`https://gtmetrix.com/?url=https://${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>GTmetrix ↗</a>
        <a href={`https://web.archive.org/web/*/https://${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Wayback Machine ↗</a>
      </div>
    </div>
  );
}

function BusinessTabWrapper({ data }: { data: AnalysisResult }) {
  const domain = data.domain;

  const mainPanels: PanelDef[] = [
    { id: "business-info", node: <BusinessTab domain={domain} />, fullWidth: true },
  ];

  const socialPanels: PanelDef[] = [
    { id: "og-preview", node: <OgPreviewPanel data={data} /> },
    { id: "legal", node: <LegalPanel data={data} /> },
  ];

  const regPanels: PanelDef[] = [
    { id: "whois", node: <WhoisPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <PanelGrid tabId="business" panels={mainPanels} grid={false} />
      <SectionHeader title="Social Sharing" />
      <PanelGrid tabId="business-social" panels={socialPanels} />
      <SectionHeader title="Registration" />
      <PanelGrid tabId="business-reg" panels={regPanels} />
      <div className="flex flex-wrap gap-2 px-1">
        <a href={`https://ahrefs.com/backlink-checker/?input=${domain}`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>Ahrefs Backlinks ↗</a>
        <a href={`https://www.similarweb.com/website/${domain}/`} target="_blank" rel="noopener noreferrer" className="badge badge-info" style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}>SimilarWeb ↗</a>
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
            {/* Curl API showcase bar — hidden on AI tab (cost control) */}
            {activeTab !== 'ai' && (
              <div className="mb-3">
                <CurlBar domain={analyze.data.domain} activeTab={activeTab} />
              </div>
            )}
            <ErrorBoundary fallbackLabel="This tab encountered an error" key={activeTab}>
              <TabContent tab={activeTab} data={cleanTechStack(analyze.data)} onNavigate={handleNavigate} />
            </ErrorBoundary>
          </div>
        )}

        {/* Empty state — SEO-friendly landing content */}
        {!analyze.data && !analyze.isPending && !analyze.error && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <Search size={28} style={{ color: "var(--accent)", opacity: 0.4 }} />
            </div>
            <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "18px", fontWeight: 700, color: "var(--text)", textAlign: "center", marginBottom: "0.5rem" }}>
              Free Domain Intelligence &amp; OSINT Tool
            </h2>
            <p style={{ fontFamily: "var(--font-ui)", fontSize: "14px", color: "var(--dim)", textAlign: "center", maxWidth: "520px", lineHeight: "22px", marginBottom: "1.5rem" }}>
              Enter any domain to analyze DNS records, SSL certificates, WHOIS data, security headers, tech stack, performance, data breaches, and more — across 9 intelligence tabs.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", width: "100%", maxWidth: "700px", marginBottom: "1.5rem" }}>
              <div className="panel" style={{ padding: "0.75rem 1rem" }}>
                <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "12px", fontWeight: 600, color: "var(--accent)", marginBottom: "0.25rem" }}>🔍 Deep Analysis</h3>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "16px" }}>DNS, SSL, WHOIS, security headers, email auth, DNSSEC, and certificate transparency</p>
              </div>
              <div className="panel" style={{ padding: "0.75rem 1rem" }}>
                <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "12px", fontWeight: 600, color: "var(--accent)", marginBottom: "0.25rem" }}>🛡️ Security &amp; Breaches</h3>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "16px" }}>HIBP breach detection, Shodan/GreyNoise intel, Observatory scoring, cookie audit</p>
              </div>
              <div className="panel" style={{ padding: "0.75rem 1rem" }}>
                <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "12px", fontWeight: 600, color: "var(--accent)", marginBottom: "0.25rem" }}>⚙️ Tech Stack</h3>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "16px" }}>Framework, CMS, CDN, WAF detection. Deep WordPress fingerprinting with plugins and themes</p>
              </div>
              <div className="panel" style={{ padding: "0.75rem 1rem" }}>
                <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "12px", fontWeight: 600, color: "var(--accent)", marginBottom: "0.25rem" }}>🤖 AI &amp; API</h3>
                <p style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", lineHeight: "16px" }}>AI-powered analysis with expert personas. Free JSON API: <code style={{ fontSize: "10px", color: "var(--text)" }}>curl yoke.lol/stripe.com</code></p>
              </div>
            </div>
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
        <span style={{ color: "var(--border)" }}>·</span>
        <ResetLayoutButton />
      </footer>
    </main>
  );
}
