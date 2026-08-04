"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dimension, FunnelReport } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { StatTile } from "./StatTile";
import { BarChart } from "./BarChart";
import { MetricsTable } from "./MetricsTable";
import { PipelineAndLoss } from "./PipelineAndLoss";

type FiltersResponse = {
  asesores: { id: string; name: string }[];
  campaigns: string[];
  adsets: string[];
  ads: string[];
};

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export function FunnelDashboard({ mode }: { mode: "asesores" | "campanas" }) {
  const [{ from, to }, setRange] = useState(defaultDateRange());
  const [filters, setFilters] = useState<FiltersResponse | null>(null);
  const [selectedAsesores, setSelectedAsesores] = useState<string[]>([]);
  const [dimension, setDimension] = useState<Dimension>("campaign");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [adsetFilter, setAdsetFilter] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [report, setReport] = useState<FunnelReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/reports/filters")
      .then((r) => r.json())
      .then(setFilters)
      .catch(() => setFilters({ asesores: [], campaigns: [], adsets: [], ads: [] }));
  }, []);

  useEffect(() => {
    setSelectedValues([]);
  }, [dimension, campaignFilter, adsetFilter]);

  useEffect(() => {
    const params = new URLSearchParams({ from, to });
    let url = "";
    if (mode === "asesores") {
      if (selectedAsesores.length) params.set("asesores", selectedAsesores.join(","));
      url = `/api/reports/asesores?${params.toString()}`;
    } else {
      params.set("dimension", dimension);
      if (campaignFilter) params.set("campaign", campaignFilter);
      if (adsetFilter) params.set("adset", adsetFilter);
      if (selectedValues.length) params.set("values", selectedValues.join(","));
      url = `/api/reports/campanas?${params.toString()}`;
    }
    setLoading(true);
    setError(null);
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => {
        setReport(data);
        setLastUpdated(new Date());
      })
      .catch((e) => setError(e.message ?? "Error al cargar el reporte"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, from, to, selectedAsesores, dimension, campaignFilter, adsetFilter, selectedValues, refreshTick]);

  async function handleRefresh() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncError(data.error ?? "No se pudo disparar el sync en n8n.");
      } else {
        // The n8n webhook acks immediately and keeps syncing in the
        // background; give it a moment to finish writing to Postgres
        // before we re-read the report.
        await new Promise((resolve) => setTimeout(resolve, 20_000));
      }
    } catch {
      setSyncError("No se pudo disparar el sync en n8n.");
    } finally {
      setSyncing(false);
    }
    setRange((r) => ({ ...r, to: defaultDateRange().to }));
    setRefreshTick((t) => t + 1);
  }

  const valueOptions = useMemo(() => {
    if (!filters) return [];
    if (dimension === "campaign") return filters.campaigns;
    if (dimension === "adset") return filters.adsets;
    return filters.ads;
  }, [filters, dimension]);

  const totals = report?.totals;
  const rows = report?.rows ?? [];

  const singleRowBreakdown = rows.length === 1 ? rows[0] : totals;

  const topRows = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.leadsAsignados - a.leadsAsignados)
        .slice(0, 10)
        .map((r) => ({ label: r.dimensionValue, values: [r.leadsAsignados, r.leadsGanados] })),
    [rows]
  );

  return (
    <div className="container">
      <div className="toolbar">
        <div className="filter-field">
          <label>Desde</label>
          <input type="date" value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </div>
        <div className="filter-field">
          <label>Hasta</label>
          <input type="date" value={to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </div>

        {mode === "asesores" ? (
          <div className="filter-field">
            <label>Asesores</label>
            <select
              multiple
              value={selectedAsesores}
              onChange={(e) => setSelectedAsesores(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {filters?.asesores.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="filter-field">
              <label>Agrupar por</label>
              <select value={dimension} onChange={(e) => setDimension(e.target.value as Dimension)}>
                <option value="campaign">Campaña</option>
                <option value="adset">Adset</option>
                <option value="ad">Ad</option>
              </select>
            </div>
            <div className="filter-field">
              <label>Campaña</label>
              <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
                <option value="">Todas</option>
                {filters?.campaigns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-field">
              <label>Adset</label>
              <select value={adsetFilter} onChange={(e) => setAdsetFilter(e.target.value)}>
                <option value="">Todos</option>
                {filters?.adsets.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-field">
              <label>Valores ({dimension})</label>
              <select multiple value={selectedValues} onChange={(e) => setSelectedValues(Array.from(e.target.selectedOptions, (o) => o.value))}>
                {valueOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="filter-field filter-actions">
          <button type="button" className="btn" onClick={handleRefresh} disabled={syncing || loading}>
            {syncing ? "Sincronizando con Kommo…" : loading ? "Actualizando…" : "Actualizar"}
          </button>
          {syncError ? (
            <span className="last-updated sync-error">{syncError}</span>
          ) : lastUpdated ? (
            <span className="last-updated">
              Actualizado {lastUpdated.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="empty">No se pudo cargar el reporte: {error}</div>
      ) : loading || !totals ? (
        <div className="loading">Cargando…</div>
      ) : (
        <>
          <div className="stat-grid">
            <StatTile label="Leads asignados" value={formatNumber(totals.leadsAsignados)} tone="accent" />
            <StatTile label="Activos" value={formatNumber(totals.leadsActivos)} tone="neutral" />
            <StatTile label="Perdidos" value={formatNumber(totals.leadsPerdidos)} tone="critical" />
            <StatTile
              label="Ganados"
              value={formatNumber(totals.leadsGanados)}
              sub={formatCurrency(totals.montoGanado)}
              tone="good"
            />
            <StatTile
              label="Citas agendadas"
              value={formatNumber(totals.citasAgendadas)}
              sub={`${formatPercent(totals.pctAgendaSobreLeads)} sobre leads`}
              tone="neutral"
            />
            <StatTile
              label="Citas asistidas"
              value={formatNumber(totals.citasAsistidas)}
              sub={`${formatPercent(totals.pctAsistenciaSobreAgenda)} sobre agenda`}
              tone="neutral"
            />
            <StatTile
              label="Cotizaciones"
              value={formatNumber(totals.cotizaciones)}
              sub={`${formatCurrency(totals.valorCotizado)} · prom. ${formatCurrency(totals.promedioCotizado)}`}
              tone="warning"
            />
            <StatTile
              label="Cierres"
              value={formatNumber(totals.cierres)}
              sub={`${formatCurrency(totals.valorCierre)} · ${formatPercent(totals.pctCierreSobreCotizacion)} sobre coti`}
              tone="good"
            />
          </div>

          <div className="section-title">{mode === "asesores" ? "Leads asignados vs. ganados por asesor" : `Leads asignados vs. ganados por ${dimension}`}</div>
          <div className="card">
            {topRows.length ? (
              <BarChart
                rows={topRows}
                series={[
                  { name: "Leads asignados", color: "var(--series-1)" },
                  { name: "Ganados", color: "var(--series-2)" },
                ]}
                formatValue={formatNumber}
              />
            ) : (
              <div className="empty">Sin datos en el rango seleccionado.</div>
            )}
          </div>

          <div className="section-title">Detalle por {mode === "asesores" ? "asesor" : dimension}</div>
          <div className="card">
            <MetricsTable rows={rows} totals={totals} dimensionLabel={mode === "asesores" ? "Asesor" : dimension} />
          </div>

          <div className="section-title">
            {rows.length === 1 ? `Pipeline y pérdidas — ${rows[0].dimensionValue}` : "Pipeline y pérdidas (todo lo filtrado)"}
          </div>
          {singleRowBreakdown ? (
            <PipelineAndLoss pipeline={singleRowBreakdown.pipeline} razonesPerdida={singleRowBreakdown.razonesPerdida} />
          ) : null}
        </>
      )}
    </div>
  );
}
