import { HelpCircle } from "lucide-react";
import { type ReactNode, useCallback, useId, useState } from "react";

interface TooltipProps {
  text: string;
  children?: ReactNode;
  /** Show as an inline help icon (?) instead of wrapping children */
  help?: boolean;
}

/**
 * Lightweight tooltip component. Shows tooltip on hover and focus.
 * Usage:
 *   <Tooltip text="Explanation here"><SomeElement /></Tooltip>
 *   <Tooltip text="What is this?" help />
 */
export function Tooltip({ text, children, help }: TooltipProps) {
  const [show, setShow] = useState(false);
  const tooltipId = useId();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && show) {
        setShow(false);
        e.stopPropagation();
      }
    },
    [show],
  );

  const tooltipPopup = (
    <span
      id={tooltipId}
      role="tooltip"
      className="tooltip-popup"
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--card-bg, #1c2028)",
        border: "1px solid var(--border, #30363d)",
        borderRadius: "6px",
        padding: "6px 10px",
        fontSize: "11px",
        fontFamily: "var(--font-ui)",
        color: "var(--text-secondary, #adbac7)",
        whiteSpace: "normal",
        width: "max-content",
        maxWidth: "280px",
        zIndex: 1000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        lineHeight: 1.4,
        pointerEvents: "none",
      }}
    >
      {text}
    </span>
  );

  if (help) {
    return (
      <button
        type="button"
        className="tooltip-wrapper"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onKeyDown={handleKeyDown}
        aria-describedby={show ? tooltipId : undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          cursor: "help",
          position: "relative",
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          font: "inherit",
          color: "inherit",
        }}
      >
        <HelpCircle size={11} style={{ color: "var(--dim)", opacity: 0.6 }} aria-hidden="true" />
        {show && tooltipPopup}
      </button>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tooltip wrapper uses hover/focus to show tooltip, not for primary interaction
    <span
      className="tooltip-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      onKeyDown={handleKeyDown}
      aria-describedby={show ? tooltipId : undefined}
      style={{ display: "inline-flex", alignItems: "center", position: "relative" }}
    >
      {children}
      {show && tooltipPopup}
    </span>
  );
}
