import type { FunnelRow } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

export function MetricsTable({ rows, totals, dimensionLabel }: { rows: FunnelRow[]; totals: FunnelRow; dimensionLabel: string }) {
  const allRows = [...rows, totals];

  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th>{dimensionLabel}</th>
            <th>Leads asignados</th>
            <th>Activos</th>
            <th>Perdidos</th>
            <th>Ganados</th>
            <th>Monto ganado</th>
            <th>Agendadas</th>
            <th>% agenda/leads</th>
            <th>Asistidas</th>
            <th>% asistencia/agenda</th>
            <th>Cotizaciones</th>
            <th>Valor cotizado</th>
            <th>Promedio cotizado</th>
            <th>% cotiz/leads</th>
            <th>% participación cotiz</th>
            <th>Cierres</th>
            <th>Valor cierre</th>
            <th>Promedio cierre</th>
            <th>% participación cierre</th>
            <th>% cierre/cotiz</th>
            <th>% cierre/asistencia</th>
          </tr>
        </thead>
        <tbody>
          {allRows.map((r) => (
            <tr key={r.dimensionValue}>
              <td>{r.dimensionValue}</td>
              <td>{formatNumber(r.leadsAsignados)}</td>
              <td>{formatNumber(r.leadsActivos)}</td>
              <td>{formatNumber(r.leadsPerdidos)}</td>
              <td>{formatNumber(r.leadsGanados)}</td>
              <td>{formatCurrency(r.montoGanado)}</td>
              <td>{formatNumber(r.citasAgendadas)}</td>
              <td>{formatPercent(r.pctAgendaSobreLeads)}</td>
              <td>{formatNumber(r.citasAsistidas)}</td>
              <td>{formatPercent(r.pctAsistenciaSobreAgenda)}</td>
              <td>{formatNumber(r.cotizaciones)}</td>
              <td>{formatCurrency(r.valorCotizado)}</td>
              <td>{formatCurrency(r.promedioCotizado)}</td>
              <td>{formatPercent(r.pctCotizacionesSobreLeads)}</td>
              <td>{formatPercent(r.pctParticipacionCotizado)}</td>
              <td>{formatNumber(r.cierres)}</td>
              <td>{formatCurrency(r.valorCierre)}</td>
              <td>{formatCurrency(r.promedioCierre)}</td>
              <td>{formatPercent(r.pctParticipacionCierre)}</td>
              <td>{formatPercent(r.pctCierreSobreCotizacion)}</td>
              <td>{formatPercent(r.pctCierreSobreAsistencia)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
