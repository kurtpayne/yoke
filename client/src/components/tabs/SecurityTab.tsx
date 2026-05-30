import type { AnalysisResult } from "../../utils/types";
import { BreachPanel } from "../BreachPanel";
import { CookieConsentPanel } from "../CookieConsentPanel";
import { BlocklistPanel } from "../NetworkPanel";
import { type PanelDef, PanelGrid } from "../PanelLayout";
import { ProtectionTrustPanel } from "../ProtectionTrustPanel";
import { EmailAuthPanel } from "../ReputationPanels";
import { SecurityHeadersPanel, SslPanel } from "../SecurityPanel";
import { CaaPanel, CertTransparencyPanel, GreynoisePanel, SecurityTxtPanel } from "../Tier1Panels";

export default function SecurityTab({ data }: { data: AnalysisResult }) {
  const domain = data.domain;

  const panels: PanelDef[] = [
    { id: "breaches", node: <BreachPanel data={data} />, fullWidth: true },
    { id: "protection-trust", node: <ProtectionTrustPanel data={data} /> },
    { id: "ssl", node: <SslPanel data={data} /> },
    { id: "security-headers", node: <SecurityHeadersPanel data={data} /> },
    { id: "email-auth", node: <EmailAuthPanel data={data} /> },
    { id: "cookie-consent", node: <CookieConsentPanel data={data} /> },
    { id: "security-txt", node: <SecurityTxtPanel data={data} /> },
    { id: "caa", node: <CaaPanel data={data} /> },
    { id: "greynoise", node: <GreynoisePanel data={data} /> },
    { id: "cert-transparency", node: <CertTransparencyPanel data={data} /> },
    { id: "blocklist", node: <BlocklistPanel data={data} /> },
  ];

  return (
    <div className="space-y-3">
      <PanelGrid tabId="security" panels={panels} />
      <div className="flex flex-wrap gap-2 px-1">
        <a
          href={`https://securityheaders.com/?q=${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="badge badge-info"
          style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}
        >
          SecurityHeaders.com ↗
        </a>
        <a
          href={`https://haveibeenpwned.com/DomainSearch/${domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="badge badge-info"
          style={{ fontSize: "10px", textDecoration: "none", cursor: "pointer" }}
        >
          HIBP ↗
        </a>
      </div>
    </div>
  );
}
