import { Puzzle, Shield, Paintbrush, Package, Zap, Search, ShoppingCart, Globe, Code2, Server } from "lucide-react";
import { Panel, StatusBadge } from "./Panel";
import type { AnalysisResult } from "../utils/types";

const categoryIcons: Record<string, typeof Puzzle> = {
  "SEO": Search,
  "Page Builder": Paintbrush,
  "E-commerce": ShoppingCart,
  "Caching": Zap,
  "Performance": Zap,
  "Security": Shield,
  "Security / Performance": Shield,
  "Forms": Package,
  "Analytics": Globe,
  "Editor": Code2,
  "Content": Code2,
  "Media": Package,
  "Multilingual": Globe,
  "Email": Package,
  "Email / Engagement": Package,
  "Backup": Package,
  "Migration": Package,
  "Utility": Package,
  "Dev Tools": Code2,
  "Users": Package,
};

export function WordPressPanel({ data }: { data: AnalysisResult }) {
  const wp = data.wordpress;
  if (!wp) return null;

  const pluginCount = wp.plugins.length;
  const grouped = new Map<string, typeof wp.plugins>();
  for (const p of wp.plugins) {
    const cat = p.category ?? "Other";
    const existing = grouped.get(cat) ?? [];
    existing.push(p);
    grouped.set(cat, existing);
  }

  // Sort categories: prioritize key categories first
  const catOrder = ["SEO", "Page Builder", "E-commerce", "Caching", "Performance", "Security", "Security / Performance", "Forms", "Analytics", "Content", "Editor", "Media", "Multilingual", "Email"];
  const sortedCats = [...grouped.entries()].sort(([a], [b]) => {
    const ai = catOrder.indexOf(a);
    const bi = catOrder.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });

  return (
    <Panel
      title="WordPress"
      icon={<Puzzle size={14} />}
      badge={
        <div className="flex items-center gap-1.5">
          {wp.version && <StatusBadge status="info" label={`v${wp.version}`} />}
          <StatusBadge status="pass" label={`${pluginCount} plugin${pluginCount !== 1 ? "s" : ""}`} />
        </div>
      }
    >
      {/* Quick Summary Row */}
      <div className="grid grid-cols-2 gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        {wp.theme && (
          <div>
            <div style={{ fontSize: "9px", fontFamily: "var(--font-ui)", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
              Theme
            </div>
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text)" }}>
              {wp.theme.name}
              {wp.parent_theme && (
                <span style={{ color: "var(--dim)", fontSize: "10px" }}> (child of {wp.parent_theme.name})</span>
              )}
            </div>
          </div>
        )}
        {wp.managed_hosting && (
          <div>
            <div style={{ fontSize: "9px", fontFamily: "var(--font-ui)", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
              Managed Hosting
            </div>
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
              <Server size={10} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />
              {wp.managed_hosting}
            </div>
          </div>
        )}
      </div>

      {/* Key Plugin Highlights */}
      {(wp.page_builder || wp.seo_plugin || wp.caching_plugin || wp.security_plugin || wp.ecommerce) && (
        <div className="px-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: "9px", fontFamily: "var(--font-ui)", color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>
            Key Stack
          </div>
          <div className="flex flex-wrap gap-1.5">
            {wp.page_builder && <KeyBadge label={wp.page_builder} icon="builder" />}
            {wp.seo_plugin && <KeyBadge label={wp.seo_plugin} icon="seo" />}
            {wp.ecommerce && <KeyBadge label={wp.ecommerce} icon="ecommerce" />}
            {wp.caching_plugin && <KeyBadge label={wp.caching_plugin} icon="cache" />}
            {wp.security_plugin && <KeyBadge label={wp.security_plugin} icon="security" />}
          </div>
        </div>
      )}

      {/* Feature Flags */}
      <div className="px-4 py-2 flex flex-wrap gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <FeatureFlag label="REST API" active={wp.api_exposed} />
        <FeatureFlag label="Block Editor" active={wp.block_editor} />
        <FeatureFlag label="Multisite" active={wp.multisite} />
      </div>

      {/* Plugin List by Category */}
      {sortedCats.map(([category, plugins]) => {
        const Icon = categoryIcons[category] ?? Package;
        return (
          <div key={category}>
            <div className="sub-section flex items-center gap-1.5" style={{ color: "var(--dim)", fontSize: "10px" }}>
              <Icon size={10} />
              {category}
              <span style={{ opacity: 0.5 }}>({plugins.length})</span>
            </div>
            {plugins.map((p, i) => (
              <div key={p.name} className="data-row">
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text)" }}>
                  {p.name}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--dim)" }}>
                  {p.slug}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </Panel>
  );
}

function KeyBadge({ label, icon }: { label: string; icon: string }) {
  const colors: Record<string, string> = {
    builder: "var(--accent)",
    seo: "#22c55e",
    ecommerce: "#a78bfa",
    cache: "#f59e0b",
    security: "#ef4444",
  };
  const color = colors[icon] ?? "var(--dim)";
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5"
      style={{
        fontSize: "10px",
        fontFamily: "var(--font-ui)",
        fontWeight: 600,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        lineHeight: "1.4",
      }}
    >
      {label}
    </span>
  );
}

function FeatureFlag({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      style={{
        fontSize: "9px",
        fontFamily: "var(--font-ui)",
        fontWeight: 600,
        letterSpacing: "0.03em",
        color: active ? "var(--success)" : "var(--dim)",
        background: active
          ? "color-mix(in srgb, var(--success) 10%, transparent)"
          : "color-mix(in srgb, var(--dim) 8%, transparent)",
        lineHeight: 1,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: active ? "var(--success)" : "var(--dim)" }}
      />
      {label}
    </span>
  );
}
