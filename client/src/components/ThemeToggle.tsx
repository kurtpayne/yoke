import { useState, useEffect, useCallback, useRef } from "react";

type Theme = "dark" | "light" | "arcade" | "deep-blue" | "enterprise" | "newsprint";

const THEMES: { id: Theme; label: string; emoji: string }[] = [
  { id: "dark", label: "Midnight", emoji: "🌙" },
  { id: "light", label: "Clean", emoji: "☀️" },
  { id: "arcade", label: "Arcade", emoji: "🕹️" },
  { id: "deep-blue", label: "Deep Blue", emoji: "🌊" },
  { id: "enterprise", label: "Enterprise", emoji: "💼" },
  { id: "newsprint", label: "Newsprint", emoji: "📰" },
];

const VALID_THEMES = new Set<string>(THEMES.map((t) => t.id));
const STORAGE_KEY = "yoke-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && VALID_THEMES.has(stored)) return stored as Theme;
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  const select = useCallback((id: Theme) => {
    setTheme(id);
    applyTheme(id);
    setOpen(false);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="theme-toggle"
        title="Change theme"
        aria-label="Change theme"
        aria-expanded={open}
      >
        <span style={{ fontSize: "14px", lineHeight: 1 }}>{current.emoji}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: "160px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "4px",
            zIndex: 999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "8px 10px",
                border: "none",
                borderRadius: "var(--radius-sm)",
                background: t.id === theme ? "var(--accent-subtle)" : "transparent",
                color: t.id === theme ? "var(--accent)" : "var(--text)",
                fontFamily: "var(--font-ui)",
                fontSize: "13px",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (t.id !== theme) e.currentTarget.style.background = "var(--surface-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = t.id === theme ? "var(--accent-subtle)" : "transparent";
              }}
            >
              <span style={{ fontSize: "14px" }}>{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
