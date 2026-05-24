import type { ReactNode } from "react";

interface PanelProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  badge?: ReactNode;
}

export function Panel({ title, icon, children, badge }: PanelProps) {
  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="opacity-60">{icon}</span>
          <span>{title}</span>
        </div>
        {badge}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function DataRow({ label, value, mono = true }: { label: ReactNode; value: ReactNode; mono?: boolean }) {
  return (
    <div className="data-row">
      <span className="data-label">{label}</span>
      <span className={mono ? "data-value" : "data-value"} style={mono ? undefined : { fontFamily: "var(--font-ui)" }}>{value}</span>
    </div>
  );
}

export function StatusBadge({ status, label }: { status: "pass" | "fail" | "warn" | "info" | "neutral"; label: string }) {
  return <span className={`badge badge-${status}`}>{label}</span>;
}

export function GradeBadge({ grade }: { grade: string }) {
  const letter = grade.replace("+", "").replace("-", "").toLowerCase();
  return <span className={`grade-badge grade-${letter.charAt(0)}`}>{grade}</span>;
}

export function SkeletonPanel({ title, icon, rows = 4 }: { title: string; icon: ReactNode; rows?: number }) {
  return (
    <div className="panel">
      <div className="panel-header flex items-center gap-2.5">
        <span className="opacity-40">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={`skel-${i}`} className="skeleton h-4 rounded" style={{ width: `${55 + Math.random() * 35}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-4 text-xs" style={{ color: "var(--dim)", fontFamily: "var(--font-ui)" }}>
      <span className="opacity-60">⚠</span> {message}
    </div>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return <div className="section-header">{title}</div>;
}
