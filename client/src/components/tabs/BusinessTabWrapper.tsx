import type { AnalysisResult } from "../../utils/types";
import { BusinessTab } from "../BusinessTab";
import { LegalPanel } from "../LegalPanel";
import { OgPreviewPanel } from "../OgPreviewPanel";
import { SectionHeader } from "../Panel";
import { type PanelDef, PanelGrid } from "../PanelLayout";
import { WaybackPanel } from "../ReputationPanels";
import { DomainExpiryPanel, WhoisPanel } from "../WhoisPanel";

export default function BusinessTabWrapper({ data }: { data: AnalysisResult }) {
  const domain = data.domain;

  const mainPanels: PanelDef[] = [{ id: "business-info", node: <BusinessTab domain={domain} />, fullWidth: true }];

  const socialPanels: PanelDef[] = [
    { id: "og-preview", node: <OgPreviewPanel data={data} /> },
    { id: "legal", node: <LegalPanel data={data} /> },
  ];

  const regPanels: PanelDef[] = [
    { id: "whois", node: <WhoisPanel data={data} /> },
    { id: "domain-expiry", node: <DomainExpiryPanel data={data} /> },
  ];

  const historyPanels: PanelDef[] = [{ id: "wayback", node: <WaybackPanel data={data} /> }];

  return (
    <div className="space-y-3">
      <PanelGrid tabId="business" panels={mainPanels} grid={false} />
      <SectionHeader title="Social Sharing" />
      <PanelGrid tabId="business-social" panels={socialPanels} />
      <SectionHeader title="Registration" />
      <PanelGrid tabId="business-reg" panels={regPanels} />
      <SectionHeader title="History" />
      <PanelGrid tabId="business-history" panels={historyPanels} />
      <div className="flex flex-wrap gap-2 px-1">
        <a
          href={`https://ahrefs.com/backlink-checker/?input=${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="badge badge-info"
          style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}
        >
          Ahrefs Backlinks ↗
        </a>
        <a
          href={`https://www.similarweb.com/website/${domain}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="badge badge-info"
          style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}
        >
          SimilarWeb ↗
        </a>
      </div>
    </div>
  );
}
