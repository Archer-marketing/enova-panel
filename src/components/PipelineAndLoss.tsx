import type { LossReasonSlice, PipelineSlice } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/format";
import { BarChart } from "./BarChart";

export function PipelineAndLoss({ pipeline, razonesPerdida }: { pipeline: PipelineSlice[]; razonesPerdida: LossReasonSlice[] }) {
  const pipelineRows = [...pipeline]
    .sort((a, b) => b.count - a.count)
    .map((p) => ({ label: p.statusName, values: [p.count] }));

  const lossRows = [...razonesPerdida]
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ label: r.reason, values: [r.count] }));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          Pipeline general
        </div>
        {pipelineRows.length ? (
          <BarChart rows={pipelineRows} series={[{ name: "Leads", color: "var(--series-1)" }]} formatValue={formatNumber} />
        ) : (
          <div className="empty">Sin datos en el rango seleccionado.</div>
        )}
      </div>
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>
          Razones de pérdida
        </div>
        {lossRows.length ? (
          <>
            <BarChart rows={lossRows} series={[{ name: "Leads perdidos", color: "var(--status-critical)" }]} formatValue={formatNumber} />
            <table className="report-table" style={{ marginTop: 16 }}>
              <thead>
                <tr>
                  <th>Razón</th>
                  <th>Leads</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {razonesPerdida.map((r) => (
                  <tr key={r.reason}>
                    <td>{r.reason}</td>
                    <td>{formatNumber(r.count)}</td>
                    <td>{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="empty">Sin datos en el rango seleccionado.</div>
        )}
      </div>
    </div>
  );
}
