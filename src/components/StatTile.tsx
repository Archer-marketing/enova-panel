export type StatTone = "accent" | "good" | "warning" | "critical" | "neutral";

const TONE_VAR: Record<StatTone, string | undefined> = {
  accent: "var(--accent)",
  good: "var(--good)",
  warning: "var(--warning)",
  critical: "var(--critical)",
  neutral: undefined,
};

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
}) {
  const toneVar = TONE_VAR[tone];
  return (
    <div className="stat-tile" style={toneVar ? ({ "--tile-tone": toneVar } as React.CSSProperties) : undefined}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
