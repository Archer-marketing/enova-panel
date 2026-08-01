type Series = { name: string; color: string };
type BarRow = { label: string; values: number[] };

/**
 * Horizontal grouped bar chart, built in plain HTML/CSS per the dataviz
 * skill's mark spec: bars capped well under 24px thick, 4px rounded end at
 * the value tip (square at the baseline), a 2px surface gap between grouped
 * bars, a legend whenever there's more than one series, and a direct value
 * label at each bar's tip.
 */
export function BarChart({
  rows,
  series,
  formatValue,
}: {
  rows: BarRow[];
  series: Series[];
  formatValue: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));

  return (
    <div>
      {series.length > 1 ? (
        <div className="legend">
          {series.map((s) => (
            <span className="legend-item" key={s.name}>
              <span className="legend-swatch" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, alignItems: "center" }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={row.label}
            >
              {row.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {row.values.map((value, i) => (
                <div key={series[i]?.name ?? i} style={{ display: "flex", alignItems: "center", gap: 6 }} title={`${series[i]?.name}: ${formatValue(value)}`}>
                  <div
                    style={{
                      height: 14,
                      borderRadius: "0 4px 4px 0",
                      background: series[i]?.color,
                      width: `${Math.max(2, (value / max) * 100)}%`,
                      minWidth: value > 0 ? 3 : 0,
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {formatValue(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
