export type Dimension = "asesor" | "campaign" | "adset" | "ad";

export type DateRange = {
  from: string; // ISO date, inclusive
  to: string; // ISO date, inclusive
};

export type ReportFilters = {
  dimension: Dimension;
  dateRange: DateRange;
  /** Restrict to these dimension values (responsible_user_id for 'asesor', text values otherwise). Empty = all. */
  values: string[];
  /** For the campañas report: narrow rows to leads under this campaign/adset before grouping by a deeper dimension. */
  campaign?: string;
  adset?: string;
};

export type PipelineSlice = {
  statusName: string;
  count: number;
};

export type LossReasonSlice = {
  reason: string;
  count: number;
  amount: number;
};

export type FunnelRow = {
  dimensionValue: string;
  leadsAsignados: number;
  leadsActivos: number;
  pctActivosSobreLeads: number;
  leadsPerdidos: number;
  leadsGanados: number;
  montoGanado: number;

  pipeline: PipelineSlice[];
  razonesPerdida: LossReasonSlice[];

  citasAgendadas: number;
  pctAgendaSobreLeads: number;

  citasAsistidas: number;
  pctAsistenciaSobreAgenda: number;

  cotizaciones: number;
  valorCotizado: number;
  promedioCotizado: number;
  pctCotizacionesSobreLeads: number;
  pctParticipacionCotizado: number;

  porCerrar: number;
  pctPorCerrarSobreCotizacion: number;

  cierres: number;
  valorCierre: number;
  promedioCierre: number;
  pctParticipacionCierre: number;
  pctCierreSobreCotizacion: number;
  pctCierreSobreAsistencia: number;
};

export type FunnelReport = {
  rows: FunnelRow[];
  totals: FunnelRow;
};
