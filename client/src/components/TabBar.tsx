import { LayoutDashboard, Server, Shield, Layers, Gauge, Building2, Newspaper, Compass, Sparkles } from "lucide-react";
import { useRef, useEffect, useState, type CSSProperties } from "react";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "infrastructure", label: "Infra", icon: Server },
  { id: "security", label: "Security", icon: Shield },
  { id: "tech", label: "Tech", icon: Layers },
  { id: "performance", label: "Perf", icon: Gauge },
  { id: "business", label: "Business", icon: Building2 },
  { id: "news", label: "News", icon: Newspaper },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "ai", label: "AI", icon: Sparkles },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface TabBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<CSSProperties>({});

  // Animate the active indicator
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const activeBtn = bar.querySelector(`[data-tab="${active}"]`) as HTMLElement;
    if (!activeBtn) return;
    setIndicatorStyle({
      left: activeBtn.offsetLeft,
      width: activeBtn.offsetWidth,
    });
  }, [active]);

  return (
    <div className="yoke-tab-bar" ref={barRef}>
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-tab={tab.id}
            className={`yoke-tab ${isActive ? "active" : ""}`}
            onClick={() => onChange(tab.id)}
            aria-label={tab.label}
            title={isActive ? undefined : tab.label}
          >
            <Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} />
            <span className="yoke-tab-label">{tab.label}</span>
          </button>
        );
      })}
      <div className="yoke-tab-indicator" style={indicatorStyle} />
    </div>
  );
}
