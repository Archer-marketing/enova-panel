import { getPool } from "./db";
import type { Dimension, FunnelRow, FunnelReport, LossReasonSlice, PipelineSlice, ReportFilters } from "./types";

// Fixed, whitelisted SQL fragments per dimension — never built from raw user
// input, so this is safe to interpolate directly.
const DIMENSION_SQL: Record<Dimension, { key: string; label: string; groupBy: string; valueColumn: string }> = {
  asesor: {
    key: "responsible_user_id::text",
    label: "coalesce(responsible_user_name, 'Sin asignar')",
    groupBy: "responsible_user_id, responsible_user_name",
    valueColumn: "responsible_user_id::text",
  },
  campaign: {
    key: "coalesce(campaign, '(sin campaña)')",
    label: "coalesce(campaign, '(sin campaña)')",
    groupBy: "campaign",
    valueColumn: "campaign",
  },
  adset: {
    key: "coalesce(adset, '(sin adset)')",
    label: "coalesce(adset, '(sin adset)')",
    groupBy: "adset",
    valueColumn: "adset",
  },
  ad: {
    key: "coalesce(ad, '(sin ad)')",
    label: "coalesce(ad, '(sin ad)')",
    groupBy: "ad",
    valueColumn: "ad",
  },
};

type WhereBuilder = { clause: string; params: unknown[] };

/** Structural filters that always apply, independent of any per-metric date column. */
function buildStructuralWhere(filters: ReportFilters): WhereBuilder {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const dim = DIMENSION_SQL[filters.dimension];

  if (filters.values.length > 0) {
    params.push(filters.values);
    conditions.push(`${dim.valueColumn} = ANY($${params.length})`);
  }
  if (filters.campaign) {
    params.push(filters.campaign);
    conditions.push(`campaign = $${params.length}`);
  }
  if (filters.adset) {
    params.push(filters.adset);
    conditions.push(`adset = $${params.length}`);
  }

  return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

function emptyRow(dimensionValue: string): FunnelRow {
  return {
    dimensionValue,
    leadsAsignados: 0,
    leadsActivos: 0,
    leadsPerdidos: 0,
    leadsGanados: 0,
    montoGanado: 0,
    pipeline: [],
    razonesPerdida: [],
    citasAgendadas: 0,
    pctAgendaSobreLeads: 0,
    citasAsistidas: 0,
    pctAsistenciaSobreAgenda: 0,
    cotizaciones: 0,
    valorCotizado: 0,
    promedioCotizado: 0,
    pctCotizacionesSobreLeads: 0,
    pctParticipacionCotizado: 0,
    cierres: 0,
    valorCierre: 0,
    promedioCierre: 0,
    pctParticipacionCierre: 0,
    pctCierreSobreCotizacion: 0,
    pctCierreSobreAsistencia: 0,
  };
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export async function getFunnelReport(filters: ReportFilters): Promise<FunnelReport> {
  const dim = DIMENSION_SQL[filters.dimension];
  const structural = buildStructuralWhere(filters);
  const { from, to } = filters.dateRange;

  // $from/$to are appended after the structural params for every query below.
  // `to` is a plain YYYY-MM-DD from the date picker, which Postgres casts to
  // that day's midnight — comparing with BETWEEN would exclude everything
  // that happened later that same day. Use the start of the next day as an
  // exclusive upper bound instead so "Hasta: hoy" includes all of today.
  const fromIdx = structural.params.length + 1;
  const toIdx = structural.params.length + 2;
  const dateParams = [...structural.params, from, to];

  const mainSql = `
    SELECT
      ${dim.key} AS dimension_key,
      ${dim.label} AS dimension_value,
      count(*) FILTER (WHERE created_at >= $${fromIdx} AND created_at < $${toIdx}::date + 1) AS leads_asignados,
      count(*) FILTER (WHERE created_at >= $${fromIdx} AND created_at < $${toIdx}::date + 1 AND NOT is_won AND NOT is_lost) AS leads_activos,
      count(*) FILTER (WHERE closed_at >= $${fromIdx} AND closed_at < $${toIdx}::date + 1 AND is_lost) AS leads_perdidos,
      count(*) FILTER (WHERE closed_at >= $${fromIdx} AND closed_at < $${toIdx}::date + 1 AND is_won) AS leads_ganados,
      coalesce(sum(price) FILTER (WHERE closed_at >= $${fromIdx} AND closed_at < $${toIdx}::date + 1 AND is_won), 0) AS monto_ganado,
      count(*) FILTER (WHERE fecha_agenda >= $${fromIdx} AND fecha_agenda < $${toIdx}::date + 1) AS citas_agendadas,
      count(*) FILTER (WHERE fecha_cita_asistida >= $${fromIdx} AND fecha_cita_asistida < $${toIdx}::date + 1) AS citas_asistidas,
      count(*) FILTER (WHERE fecha_cotizacion >= $${fromIdx} AND fecha_cotizacion < $${toIdx}::date + 1) AS cotizaciones,
      coalesce(sum(price) FILTER (WHERE fecha_cotizacion >= $${fromIdx} AND fecha_cotizacion < $${toIdx}::date + 1), 0) AS valor_cotizado
    FROM kommo_leads
    ${structural.clause}
    GROUP BY ${dim.groupBy}
    ORDER BY dimension_value
  `;

  const pipelineSql = `
    SELECT
      ${dim.key} AS dimension_key,
      coalesce(s.status_name, 'Sin status') AS status_name,
      count(*) AS count
    FROM kommo_leads l
    LEFT JOIN kommo_statuses s ON s.pipeline_id = l.pipeline_id AND s.status_id = l.status_id
    ${structural.clause ? `${structural.clause} AND` : "WHERE"} created_at >= $${fromIdx} AND created_at < $${toIdx}::date + 1
    GROUP BY dimension_key, s.status_name
  `;

  const lossSql = `
    SELECT
      ${dim.key} AS dimension_key,
      coalesce(loss_reason_name, 'Sin razón') AS reason,
      count(*) AS count,
      coalesce(sum(price), 0) AS amount
    FROM kommo_leads
    ${structural.clause ? `${structural.clause} AND` : "WHERE"} is_lost AND closed_at >= $${fromIdx} AND closed_at < $${toIdx}::date + 1
    GROUP BY dimension_key, loss_reason_name
  `;

  const [mainRes, pipelineRes, lossRes] = await Promise.all([
    getPool().query(mainSql, dateParams),
    getPool().query(pipelineSql, dateParams),
    getPool().query(lossSql, dateParams),
  ]);

  const rowsByKey = new Map<string, FunnelRow>();

  for (const r of mainRes.rows) {
    const row = emptyRow(r.dimension_value);
    row.leadsAsignados = Number(r.leads_asignados);
    row.leadsActivos = Number(r.leads_activos);
    row.leadsPerdidos = Number(r.leads_perdidos);
    row.leadsGanados = Number(r.leads_ganados);
    row.montoGanado = Number(r.monto_ganado);
    row.citasAgendadas = Number(r.citas_agendadas);
    row.citasAsistidas = Number(r.citas_asistidas);
    row.cotizaciones = Number(r.cotizaciones);
    row.valorCotizado = Number(r.valor_cotizado);

    row.cierres = row.leadsGanados;
    row.valorCierre = row.montoGanado;

    row.pctAgendaSobreLeads = pct(row.citasAgendadas, row.leadsAsignados);
    row.pctAsistenciaSobreAgenda = pct(row.citasAsistidas, row.citasAgendadas);
    row.pctCotizacionesSobreLeads = pct(row.cotizaciones, row.leadsAsignados);
    row.promedioCotizado = pct(row.valorCotizado, row.cotizaciones);
    row.promedioCierre = pct(row.valorCierre, row.cierres);
    row.pctCierreSobreCotizacion = pct(row.cierres, row.cotizaciones);
    row.pctCierreSobreAsistencia = pct(row.cierres, row.citasAsistidas);

    rowsByKey.set(r.dimension_key, row);
  }

  for (const r of pipelineRes.rows) {
    const row = rowsByKey.get(r.dimension_key);
    if (!row) continue;
    const slice: PipelineSlice = { statusName: r.status_name, count: Number(r.count) };
    row.pipeline.push(slice);
  }

  for (const r of lossRes.rows) {
    const row = rowsByKey.get(r.dimension_key);
    if (!row) continue;
    const slice: LossReasonSlice = { reason: r.reason, count: Number(r.count), amount: Number(r.amount) };
    row.razonesPerdida.push(slice);
  }

  const rows = [...rowsByKey.values()];

  // "% participación" = this row's share of the total across every row
  // currently in view (computed here, not in SQL, since it depends on the
  // full result set).
  const totalValorCotizado = rows.reduce((sum, r) => sum + r.valorCotizado, 0);
  const totalValorCierre = rows.reduce((sum, r) => sum + r.valorCierre, 0);
  for (const row of rows) {
    row.pctParticipacionCotizado = pct(row.valorCotizado, totalValorCotizado);
    row.pctParticipacionCierre = pct(row.valorCierre, totalValorCierre);
  }

  const totals = emptyRow("Total");
  totals.leadsAsignados = rows.reduce((s, r) => s + r.leadsAsignados, 0);
  totals.leadsActivos = rows.reduce((s, r) => s + r.leadsActivos, 0);
  totals.leadsPerdidos = rows.reduce((s, r) => s + r.leadsPerdidos, 0);
  totals.leadsGanados = rows.reduce((s, r) => s + r.leadsGanados, 0);
  totals.montoGanado = rows.reduce((s, r) => s + r.montoGanado, 0);
  totals.citasAgendadas = rows.reduce((s, r) => s + r.citasAgendadas, 0);
  totals.citasAsistidas = rows.reduce((s, r) => s + r.citasAsistidas, 0);
  totals.cotizaciones = rows.reduce((s, r) => s + r.cotizaciones, 0);
  totals.valorCotizado = totalValorCotizado;
  totals.cierres = totals.leadsGanados;
  totals.valorCierre = totalValorCierre;
  totals.pctAgendaSobreLeads = pct(totals.citasAgendadas, totals.leadsAsignados);
  totals.pctAsistenciaSobreAgenda = pct(totals.citasAsistidas, totals.citasAgendadas);
  totals.pctCotizacionesSobreLeads = pct(totals.cotizaciones, totals.leadsAsignados);
  totals.promedioCotizado = pct(totals.valorCotizado, totals.cotizaciones);
  totals.promedioCierre = pct(totals.valorCierre, totals.cierres);
  totals.pctCierreSobreCotizacion = pct(totals.cierres, totals.cotizaciones);
  totals.pctCierreSobreAsistencia = pct(totals.cierres, totals.citasAsistidas);
  totals.pctParticipacionCotizado = totals.valorCotizado > 0 ? 1 : 0;
  totals.pctParticipacionCierre = totals.valorCierre > 0 ? 1 : 0;

  // Merge pipeline/loss slices across all rows for the totals row too.
  const pipelineTotals = new Map<string, number>();
  const lossTotals = new Map<string, { count: number; amount: number }>();
  for (const row of rows) {
    for (const slice of row.pipeline) {
      pipelineTotals.set(slice.statusName, (pipelineTotals.get(slice.statusName) ?? 0) + slice.count);
    }
    for (const slice of row.razonesPerdida) {
      const acc = lossTotals.get(slice.reason) ?? { count: 0, amount: 0 };
      acc.count += slice.count;
      acc.amount += slice.amount;
      lossTotals.set(slice.reason, acc);
    }
  }
  totals.pipeline = [...pipelineTotals.entries()].map(([statusName, count]) => ({ statusName, count }));
  totals.razonesPerdida = [...lossTotals.entries()].map(([reason, v]) => ({ reason, ...v }));

  return { rows, totals };
}

export async function listAsesores(): Promise<{ id: string; name: string }[]> {
  const res = await getPool().query(
    `SELECT responsible_user_id, responsible_user_name FROM kommo_asesores ORDER BY responsible_user_name`
  );
  return res.rows.map((r) => ({ id: String(r.responsible_user_id), name: r.responsible_user_name ?? "Sin asignar" }));
}

export async function listCampanas(): Promise<{ campaign: string | null; adset: string | null; ad: string | null }[]> {
  const res = await getPool().query(`SELECT campaign, adset, ad FROM kommo_campanas ORDER BY campaign, adset, ad`);
  return res.rows;
}
