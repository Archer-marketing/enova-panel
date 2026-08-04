type Series = { name: string; color: string };
type BarRow = { label: string; values: number[] };

/**
 * Horizontal grouped bar chart, built in plain HTML/CSS per the dataviz
 * skill's mark spec: bars capped well under 24px thick, a rounded track so
 * the empty portion still reads as part of the scale, a 2px surface gap
 * between grouped bars, a legend whenever there's more than one series, and
 * a direct value label at each bar's tip.
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
          <div className="bar-row" key={row.label}>
            <div className="bar-row-label" title={row.label}>
              {row.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {row.values.map((value, i) => (
                <div key={series[i]?.name ?? i} style={{ display: "flex", alignItems: "center", gap: 8 }} title={`${series[i]?.name}: ${formatValue(value)}`}>
                  <div className="bar-track" style={{ flex: 1 }}>
                    <div
                      className="bar-fill"
                      style={{
                        background: series[i]?.color,
                        width: `${Math.max(2, (value / max) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="bar-value">{formatValue(value)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
