import { PerformancePanel, CarbonPanel } from "../PerformancePanel";
import { ThirdPartyScriptsPanel } from "../ThirdPartyScriptsPanel";
import { CompressionPanel } from "../NewPanels";
import { CachePanel } from "../CachePanel";
import { PanelGrid, type PanelDef } from "../PanelLayout";
import { AxisScoreBadge } from "../DomainScore";
import type { AnalysisResult } from "../../utils/types";

export default function PerformanceTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;

  const panels: PanelDef[] = [
    { id: "pagespeed", node: <PerformancePanel data={data} /> },
    { id: "third-party-scripts", node: <ThirdPartyScriptsPanel data={data} /> },
    { id: "compression", node: <CompressionPanel data={data} /> },
    { id: "cache", node: <CachePanel data={data} /> },
    { id: "carbon", node: <CarbonPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <AxisScoreBadge data={data} axis="performance" />
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
