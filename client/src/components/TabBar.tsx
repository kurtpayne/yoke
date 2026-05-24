import { LayoutDashboard, Server, Shield, Layers, Gauge, Building2, Newspaper, Compass, Sparkles } from "lucide-react";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "infrastructure", label: "Infrastructure", icon: Server },
  { id: "security", label: "Security", icon: Shield },
  { id: "tech", label: "Tech Stack", icon: Layers },
  { id: "performance", label: "Performance", icon: Gauge },
  { id: "business", label: "Business", icon: Building2 },
  { id: "news", label: "News & Social", icon: Newspaper },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "ai", label: "AI Analysis", icon: Sparkles },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface TabBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className="tab-bar">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn ${active === tab.id ? "active" : ""}`}
            onClick={() => onChange(tab.id)}
            aria-label={tab.label}
          >
            <Icon size={13} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
