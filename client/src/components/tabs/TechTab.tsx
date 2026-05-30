import type { AnalysisResult } from "../../utils/types";
import { AccessibilityPanel } from "../AccessibilityPanel";
import { AiReadinessPanel } from "../AiReadinessPanel";
import { LlmsTxtPanel, MetaPanel, RobotsDeepPanel } from "../MetaPanel";
import { type PanelDef, PanelGrid } from "../PanelLayout";
import { StructuredDataPanel } from "../StructuredDataPanel";
import { TechStackPanel } from "../TechStackPanel";
import { WellKnownPanel } from "../Tier1Panels";
import { WordPressPanel } from "../WordPressPanel";

export default function TechTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;

  const panels: PanelDef[] = [
    { id: "tech-stack", node: <TechStackPanel data={data} /> },
    { id: "wordpress", node: <WordPressPanel data={data} />, visible: !!data.wordpress },
    { id: "meta", node: <MetaPanel data={data} /> },
    { id: "structured-data", node: <StructuredDataPanel data={data} /> },
    { id: "accessibility", node: <AccessibilityPanel data={data} /> },
    { id: "robots", node: <RobotsDeepPanel data={data} /> },
    { id: "llms-txt", node: <LlmsTxtPanel data={data} /> },
    { id: "ai-readiness", node: <AiReadinessPanel data={data} /> },
    { id: "well-known", node: <WellKnownPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <PanelGrid tabId="tech" panels={panels} />
      <div className="flex flex-wrap gap-2 px-1">
        <a
          href={`https://builtwith.com/${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="badge badge-info"
          style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}
        >
          BuiltWith ↗
        </a>
        <a
          href={`https://www.wappalyzer.com/lookup/${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="badge badge-info"
          style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}
        >
          Wappalyzer ↗
        </a>
        <a
          href={`https://search.google.com/test/rich-results?url=https://${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="badge badge-info"
          style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}
        >
          Rich Results Test ↗
        </a>
      </div>
    </div>
  );
}
