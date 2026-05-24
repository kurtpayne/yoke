import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[Yoke] Rendering error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            gap: "16px",
            color: "var(--text-muted, #8b949e)",
            fontFamily: "var(--font-ui, -apple-system, sans-serif)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "32px" }}>⚠️</div>
          <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text, #c9d1d9)" }}>
            {this.props.fallbackLabel ?? "Something went wrong"}
          </div>
          <div style={{ fontSize: "12px", maxWidth: "400px", lineHeight: 1.5 }}>
            {this.state.error?.message ?? "An unexpected error occurred while rendering this section."}
          </div>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "8px 20px",
              borderRadius: "6px",
              border: "1px solid var(--border, #30363d)",
              background: "var(--surface, #161b22)",
              color: "var(--accent, #00e5ff)",
              fontSize: "13px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
