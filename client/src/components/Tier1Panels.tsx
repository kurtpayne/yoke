import { Shield, Leaf, Globe, Search, Lock, AlertTriangle, CheckCircle2, XCircle, ExternalLink, Eye } from "lucide-react";
import { Panel, DataRow, StatusBadge } from "./Panel";
import { Tooltip } from "./Tooltip";
import type { AnalysisResult } from "../utils/types";

// ─── Certificate Transparency Panel ─────────────────────────────────

export function CertTransparencyPanel({ data }: { data: AnalysisResult }) {
  const ct = data.cert_transparency;
  if (!ct || ct.error) return null;
  if (ct.subdomains.length === 0 && ct.total_certs === 0) return null;

  return (
    <Panel
      title="Certificate Transparency"
      icon={<Search size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {ct.has_wildcard && (
            <Tooltip text="A wildcard certificate (*.domain.com) was found, covering all subdomains">
              <StatusBadge status="info" label="Wildcard" />
            </Tooltip>
          )}
          <Tooltip text={`${ct.subdomains.length} unique subdomains discovered from ${ct.total_certs} SSL certificate issuances in public CT logs`}>
            <span style={{ cursor: "help" }}>
              <StatusBadge status="info" label={`${ct.subdomains.length} subdomains`} />
            </span>
          </Tooltip>
        </div>
      }
    >
      <div className="p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <DataRow label="Certificates found" value={ct.total_certs.toLocaleString()} />
        </div>
        {ct.issuers.length > 0 && (
          <div>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Certificate Issuers
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {ct.issuers.map((issuer, i) => (
                <span key={issuer} className="badge badge-info" style={{ fontSize: "10px" }}>{issuer}</span>
              ))}
            </div>
          </div>
        )}
        {ct.subdomains.length > 0 && (
          <div>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Discovered Subdomains
            </span>
            <div className="mt-1" style={{ maxHeight: "200px", overflowY: "auto" }}>
              <div className="flex flex-wrap gap-1.5">
                {ct.subdomains.slice(0, 50).map((sub, i) => (
                  <span key={sub} style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg)", background: "var(--surface)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)" }}>
                    {sub}
                  </span>
                ))}
                {ct.subdomains.length > 50 && (
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", padding: "2px 6px" }}>
                    +{ct.subdomains.length - 50} more
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── Security.txt Panel ─────────────────────────────────────────────

export function SecurityTxtPanel({ data }: { data: AnalysisResult }) {
  const sec = data.security_txt;
  if (!sec) return null;

  return (
    <Panel
      title="Security Disclosure"
      icon={<Shield size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {sec.found ? (
            <>
              {sec.has_bug_bounty && (
                <Tooltip text={`Bug bounty program through ${sec.bug_bounty_platform ?? "external platform"}`}>
                  <StatusBadge status="pass" label={sec.bug_bounty_platform ?? "Bug Bounty"} />
                </Tooltip>
              )}
              {sec.hiring && (
                <Tooltip text="This organization is actively hiring security professionals">
                  <StatusBadge status="info" label="Hiring" />
                </Tooltip>
              )}
              {sec.is_expired && (
                <Tooltip text="The security.txt file has passed its stated expiry date and may contain outdated information">
                  <StatusBadge status="fail" label="Expired" />
                </Tooltip>
              )}
              {!sec.is_expired && <StatusBadge status="pass" label="security.txt" />}
            </>
          ) : (
            <Tooltip text="No security.txt file found at /.well-known/security.txt — this is the standard way to publish vulnerability disclosure policies (RFC 9116)">
              <span style={{ cursor: "help" }}><StatusBadge status="warn" label="Not found" /></span>
            </Tooltip>
          )}
        </div>
      }
    >
      <div className="p-3 space-y-2">
        {sec.found ? (
          <>
            {sec.contact.length > 0 && sec.contact.map((c, i) => (
              <DataRow key={`contact-${i}`} label={i === 0 ? "Contact" : ""} value={
                c.startsWith("http") ? (
                  <a href={c} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontSize: "12px" }}>
                    {c} <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
                  </a>
                ) : <span style={{ fontSize: "12px" }}>{c}</span>
              } copyValue={c} />
            ))}
            {sec.policy && (
              <DataRow label="Policy" value={
                <a href={sec.policy} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontSize: "12px" }}>
                  {sec.policy} <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
                </a>
              } copyValue={sec.policy} />
            )}
            {sec.acknowledgments && (
              <DataRow label="Acknowledgments" value={
                <a href={sec.acknowledgments} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontSize: "12px" }}>
                  {sec.acknowledgments} <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
                </a>
              } copyValue={sec.acknowledgments} />
            )}
            {sec.hiring && (
              <DataRow label="Hiring" value={
                <a href={sec.hiring} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontSize: "12px" }}>
                  {sec.hiring} <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
                </a>
              } copyValue={sec.hiring} />
            )}
            {sec.encryption && <DataRow label="Encryption" value={sec.encryption} />}
            {sec.expires && (
              <DataRow label="Expires" value={
                <span style={{ color: sec.is_expired ? "var(--danger)" : "var(--fg)", fontSize: "12px" }}>
                  {sec.expires} {sec.is_expired && " ⚠️ Expired"}
                </span>
              } copyValue={sec.expires} />
            )}
            {sec.preferred_languages && <DataRow label="Languages" value={sec.preferred_languages} />}
          </>
        ) : (
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--dim)", padding: "8px 0" }}>
            No security.txt found. This file (RFC 9116) helps security researchers report vulnerabilities.
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── Green Hosting Panel ────────────────────────────────────────────

export function GreenHostingPanel({ data }: { data: AnalysisResult }) {
  const gh = data.green_hosting;
  if (!gh || gh.error) return null;

  return (
    <Panel
      title="Green Hosting"
      icon={<Leaf size={14} />}
      badge={
        <Tooltip text={gh.green
          ? "This site's hosting infrastructure uses verified renewable energy"
          : "This site's hosting is not verified as using renewable energy by the Green Web Foundation"
        }>
          <span style={{ cursor: "help" }}>
            <StatusBadge status={gh.green ? "pass" : "info"} label={gh.green ? "🍃 Green" : "Not verified"} />
          </span>
        </Tooltip>
      }
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: "28px" }}>{gh.green ? "🍃" : "🏭"}</span>
          <div>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: "13px", fontWeight: 600, color: gh.green ? "var(--success)" : "var(--dim)" }}>
              {gh.green ? "Verified Green Hosting" : "Not Verified as Green"}
            </div>
            {gh.hosted_by && (
              <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)", marginTop: "2px" }}>
                Hosted by: {gh.hosted_by_website ? (
                  <a href={gh.hosted_by_website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                    {gh.hosted_by} <ExternalLink size={9} style={{ display: "inline", verticalAlign: "middle" }} />
                  </a>
                ) : gh.hosted_by}
              </div>
            )}
          </div>
        </div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
          Data from <a href="https://www.thegreenwebfoundation.org/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>Green Web Foundation</a>
        </div>
      </div>
    </Panel>
  );
}

// ─── Well-Known Endpoints Panel ─────────────────────────────────────

export function WellKnownPanel({ data }: { data: AnalysisResult }) {
  const wk = data.well_known;
  if (!wk) return null;
  const foundCount = wk.endpoints.filter(e => e.found).length;
  if (foundCount === 0 && wk.endpoints.length === 0) return null;

  return (
    <Panel
      title="Well-Known Endpoints"
      icon={<Globe size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {wk.pwa_ready && (
            <Tooltip text="Site has a valid web app manifest with standalone display mode — qualifies as a Progressive Web App">
              <StatusBadge status="pass" label="PWA Ready" />
            </Tooltip>
          )}
          {wk.has_mobile_apps && (
            <Tooltip text="Mobile app deep linking configured (Apple Universal Links or Android App Links)">
              <StatusBadge status="info" label="📱 Mobile Apps" />
            </Tooltip>
          )}
          <StatusBadge status={foundCount > 0 ? "pass" : "info"} label={`${foundCount}/${wk.endpoints.length} found`} />
        </div>
      }
    >
      <div className="p-3 space-y-2">
        {wk.endpoints.map((ep, i) => (
          <div key={ep.path} className="flex items-start gap-2 py-1" style={{ borderBottom: i < wk.endpoints.length - 1 ? "1px solid var(--border)" : "none" }}>
            <span style={{ marginTop: "2px" }}>
              {ep.found ? <CheckCircle2 size={12} style={{ color: "var(--success)" }} /> : <XCircle size={12} style={{ color: "var(--dim)", opacity: 0.4 }} />}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: ep.found ? "var(--fg)" : "var(--dim)" }}>
                  {ep.path}
                </span>
                <span style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)" }}>
                  {ep.name}
                </span>
              </div>
              {ep.found && ep.data && (
                <div style={{ marginTop: "4px" }}>
                  {/* ads.txt details */}
                  {ep.path === "/ads.txt" && ep.data.partner_count != null && (
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--dim)" }}>
                      {(ep.data.partner_count as number).toLocaleString()} ad partner entries
                      {Array.isArray(ep.data.top_partners) && (ep.data.top_partners as string[]).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(ep.data.top_partners as string[]).slice(0, 6).map((p, j) => (
                            <span key={j} className="badge badge-info" style={{ fontSize: "9px" }}>{p}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Manifest details */}
                  {ep.name === "Web App Manifest" && (
                    <div className="flex flex-wrap gap-1.5">
                      {ep.data.name ? <span className="badge badge-info" style={{ fontSize: "9px" }}>{String(ep.data.name)}</span> : null}
                      {ep.data.display ? <span className="badge badge-info" style={{ fontSize: "9px" }}>display: {String(ep.data.display)}</span> : null}
                      {ep.data.theme_color ? (
                        <span className="badge badge-info" style={{ fontSize: "9px" }}>
                          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: String(ep.data.theme_color), marginRight: "4px", verticalAlign: "middle" }} />
                          {String(ep.data.theme_color)}
                        </span>
                      ) : null}
                      {(ep.data.icon_count as number) > 0 && <span className="badge badge-info" style={{ fontSize: "9px" }}>{ep.data.icon_count as number} icons</span>}
                    </div>
                  )}
                  {/* AASA details */}
                  {ep.path === "/.well-known/apple-app-site-association" && Array.isArray(ep.data.app_ids) && (
                    <div className="flex flex-wrap gap-1">
                      {(ep.data.app_ids as string[]).map((id, j) => (
                        <span key={j} style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)", background: "var(--surface)", padding: "1px 4px", borderRadius: "3px" }}>{id}</span>
                      ))}
                    </div>
                  )}
                  {/* Android asset links */}
                  {ep.path === "/.well-known/assetlinks.json" && Array.isArray(ep.data.package_names) && (
                    <div className="flex flex-wrap gap-1">
                      {(ep.data.package_names as string[]).map((pkg, j) => (
                        <span key={j} style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)", background: "var(--surface)", padding: "1px 4px", borderRadius: "3px" }}>{pkg}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── CAA Analysis Panel ─────────────────────────────────────────────

export function CaaPanel({ data }: { data: AnalysisResult }) {
  const caa = data.caa_analysis;
  if (!caa) return null;

  return (
    <Panel
      title="Certificate Authority Authorization"
      icon={<Lock size={14} />}
      badge={
        <Tooltip text={caa.has_caa
          ? "CAA records restrict which Certificate Authorities can issue SSL certificates for this domain"
          : "No CAA records — any Certificate Authority can issue certificates for this domain"
        }>
          <span style={{ cursor: "help" }}>
            <StatusBadge status={caa.has_caa ? "pass" : "warn"} label={caa.has_caa ? `${caa.records.length} CA${caa.records.length !== 1 ? "s" : ""} authorized` : "No CAA"} />
          </span>
        </Tooltip>
      }
    >
      <div className="p-3 space-y-2">
        {caa.has_caa ? (
          <>
            {caa.records.map((rec, i) => (
              <DataRow
                key={`caa-${rec.value}`}
                label={
                  <div className="flex items-center gap-2">
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: "12px", fontWeight: 600, color: "var(--fg)" }}>
                      {rec.ca_name}
                    </span>
                    <span className="badge badge-info" style={{ fontSize: "9px" }}>{rec.tag}</span>
                  </div>
                }
                value={<span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)" }}>{rec.value}</span>}
                copyValue={rec.value}
              />
            ))}
            {caa.has_wildcard_policy && (
              <div className="flex items-center gap-1.5 mt-1">
                <Tooltip text="Separate CAA policy for wildcard certificates (*.domain.com)">
                  <StatusBadge status="info" label="Wildcard policy" />
                </Tooltip>
              </div>
            )}
            {caa.iodef && (
              <DataRow label={
                <Tooltip text="Incident Object Description Exchange Format — where CAA violations are reported">
                  <span style={{ cursor: "help" }}>Violation reporting</span>
                </Tooltip>
              } value={caa.iodef} />
            )}
          </>
        ) : (
          <div style={{ fontFamily: "var(--font-ui)", fontSize: "12px", color: "var(--warning)", padding: "4px 0" }}>
            <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
            No CAA records — any Certificate Authority can issue certificates for this domain
          </div>
        )}
      </div>
    </Panel>
  );
}

// ─── GreyNoise IP Intelligence Panel ────────────────────────────────

export function GreynoisePanel({ data }: { data: AnalysisResult }) {
  const gn = data.greynoise;
  if (!gn || gn.error) return null;

  const classColor = gn.classification === "malicious" ? "var(--danger)"
    : gn.classification === "benign" ? "var(--success)"
    : "var(--dim)";

  const classLabel = gn.classification === "malicious" ? "Malicious"
    : gn.classification === "benign" ? "Benign"
    : "Unknown";

  return (
    <Panel
      title="IP Intelligence"
      icon={<Eye size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {gn.riot && (
            <Tooltip text="RIOT = Rule It Out — this IP belongs to a common business service (CDN, DNS provider, cloud platform) and is expected to generate internet traffic">
              <StatusBadge status="info" label="Business Service" />
            </Tooltip>
          )}
          {gn.noise && (
            <Tooltip text="This IP has been observed scanning or crawling the internet — could be benign (search engine) or malicious (bot)">
              <StatusBadge status="warn" label="Internet Scanner" />
            </Tooltip>
          )}
          <Tooltip text={`GreyNoise classification: ${classLabel} — based on observed internet scanning behavior`}>
            <span style={{ cursor: "help" }}>
              <StatusBadge status={gn.classification === "malicious" ? "fail" : gn.classification === "benign" ? "pass" : "info"} label={classLabel} />
            </span>
          </Tooltip>
        </div>
      }
    >
      <div className="p-3 space-y-2">
        <DataRow label="IP" value={gn.ip} />
        <DataRow label="Classification" value={
          <span style={{ color: classColor, fontWeight: 600 }}>{classLabel}</span>
        } copyValue={classLabel} />
        {gn.name && <DataRow label="Identity" value={gn.name} />}
        {gn.riot && <DataRow label="Service Type" value="Common Business Service (CDN/DNS/Cloud)" />}
        {gn.noise && <DataRow label="Scanning" value="Observed scanning the internet" />}
        {gn.link && (
          <div style={{ marginTop: "4px" }}>
            <a href={gn.link} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-ui)", fontSize: "11px", color: "var(--accent)", textDecoration: "none" }}>
              View on GreyNoise <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} />
            </a>
          </div>
        )}
        <div style={{ fontFamily: "var(--font-ui)", fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
          Data from <a href="https://viz.greynoise.io/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>GreyNoise Community</a>
        </div>
      </div>
    </Panel>
  );
}
