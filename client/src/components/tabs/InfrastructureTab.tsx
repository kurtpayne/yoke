import { DnsPanel } from "../DnsPanel";
import { IpInfoPanel, BlocklistPanel, HttpProtocolsPanel } from "../NetworkPanel";
import { RedirectPanel, HeadersPanel } from "../HttpPanel";
import { PanelGrid, type PanelDef } from "../PanelLayout";
import { SectionHeader } from "../Panel";
import { IpMap } from "../IpMap";
import { DnssecPanel, CompressionPanel, HostingPanel } from "../NewPanels";
import { ShodanPanel } from "../ShodanPanel";
import { AvailabilityPanel } from "../AvailabilityPanel";
import { SubdomainScanPanel } from "../SubdomainScanPanel";
import { AxisScoreBadge } from "../DomainScore";
import { GreenHostingPanel } from "../Tier1Panels";
import type { AnalysisResult } from "../../utils/types";

export default function InfrastructureTab({ data }: { data: AnalysisResult }) {
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
    { id: "availability", node: <AvailabilityPanel domain={domain} /> },
    { id: "shodan", node: <ShodanPanel data={data} /> },
    { id: "subdomain-scan", node: <SubdomainScanPanel domain={domain} /> },
    { id: "redirects", node: <RedirectPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <AxisScoreBadge data={data} axis="reliability" />
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
