"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dimension, FunnelReport } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { StatTile } from "./StatTile";
import { BarChart } from "./BarChart";
import { MetricsTable } from "./MetricsTable";
import { PipelineAndLoss } from "./PipelineAndLoss";
import { MultiSelectDropdown } from "./MultiSelectDropdown";

type Campana = { campaign: string | null; adset: string | null; ad: string | null };

type FiltersResponse = {
  asesores: { id: string; name: string }[];
  campanas: Campana[];
};

const DIMENSION_LABEL: Record<Dimension, string> = {
  asesor: "Asesor",
  campaign: "Campaña",
  adset: "Conjunto de anuncios",
  ad: "Anuncio",
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

  // Campañas mode is a Meta-style drill-down: campaign -> adset -> ad.
  // The current level is derived from how deep we've drilled, not chosen
  // separately, so the UI can never end up in an inconsistent state (e.g.
  // "group by ad" while filtered to a campaign that isn't shown anywhere).
  const [drillCampaign, setDrillCampaign] = useState("");
  const [drillAdset, setDrillAdset] = useState("");
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  const [report, setReport] = useState<FunnelReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const campanasDimension: Dimension = !drillCampaign ? "campaign" : !drillAdset ? "adset" : "ad";
  const dimension: Dimension = mode === "asesores" ? "asesor" : campanasDimension;

  useEffect(() => {
    fetch("/api/reports/filters")
      .then((r) => r.json())
      .then(setFilters)
      .catch(() => setFilters({ asesores: [], campanas: [] }));
  }, []);

  useEffect(() => {
    setSelectedValues([]);
  }, [drillCampaign, drillAdset]);

  useEffect(() => {
    const params = new URLSearchParams({ from, to });
    let url = "";
    if (mode === "asesores") {
      if (selectedAsesores.length) params.set("asesores", selectedAsesores.join(","));
      url = `/api/reports/asesores?${params.toString()}`;
    } else {
      params.set("dimension", campanasDimension);
      if (drillCampaign) params.set("campaign", drillCampaign);
      if (drillAdset) params.set("adset", drillAdset);
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
  }, [mode, from, to, selectedAsesores, campanasDimension, drillCampaign, drillAdset, selectedValues, refreshTick]);

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

  // Options for the "filtrar" multi-select, and for the drill-down clicks:
  // whatever campaign/adset/ad values exist under the current scope.
  const levelOptions = useMemo(() => {
    if (!filters) return [];
    const scoped = filters.campanas.filter(
      (c) => (!drillCampaign || c.campaign === drillCampaign) && (!drillAdset || c.adset === drillAdset)
    );
    const field = campanasDimension === "campaign" ? "campaign" : campanasDimension === "adset" ? "adset" : "ad";
    return [...new Set(scoped.map((c) => c[field]).filter(Boolean))] as string[];
  }, [filters, drillCampaign, drillAdset, campanasDimension]);

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

  // Who/what actually closes deals — ranked by cierres, not by lead
  // volume, so a small campaign or adset with a high close rate still
  // shows up even if it never makes the "top by leads" cut above.
  const topCierreRows = useMemo(
    () =>
      [...rows]
        .filter((r) => r.cierres > 0)
        .sort((a, b) => b.cierres - a.cierres)
        .slice(0, 10)
        .map((r) => ({ label: r.dimensionValue, values: [r.cierres] })),
    [rows]
  );

  const canDrillDeeper = mode === "campanas" && campanasDimension !== "ad";
  function handleDrill(value: string) {
    if (campanasDimension === "campaign") setDrillCampaign(value);
    else if (campanasDimension === "adset") setDrillAdset(value);
  }

  return (
    <div className="container">
      {mode === "campanas" ? (
        <div className="breadcrumb">
          <button
            type="button"
            className={!drillCampaign ? "breadcrumb-current" : "breadcrumb-link"}
            onClick={() => {
              setDrillCampaign("");
              setDrillAdset("");
            }}
          >
            Todas las campañas
          </button>
          {drillCampaign ? (
            <>
              <span className="breadcrumb-sep">›</span>
              <button
                type="button"
                className={!drillAdset ? "breadcrumb-current" : "breadcrumb-link"}
                onClick={() => setDrillAdset("")}
              >
                {drillCampaign}
              </button>
            </>
          ) : null}
          {drillAdset ? (
            <>
              <span className="breadcrumb-sep">›</span>
              <span className="breadcrumb-current">{drillAdset}</span>
            </>
          ) : null}
        </div>
      ) : null}

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
            <MultiSelectDropdown
              placeholder="Todos"
              options={filters?.asesores ?? []}
              selected={selectedAsesores}
              onChange={setSelectedAsesores}
            />
          </div>
        ) : (
          <div className="filter-field">
            <label>Filtrar {DIMENSION_LABEL[campanasDimension].toLowerCase()}</label>
            <MultiSelectDropdown
              placeholder="Todos"
              options={levelOptions.map((v) => ({ id: v, name: v }))}
              selected={selectedValues}
              onChange={setSelectedValues}
            />
          </div>
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
            <StatTile
              label="Activos"
              value={formatNumber(totals.leadsActivos)}
              sub={`${formatPercent(totals.pctActivosSobreLeads)} sobre leads`}
              tone="neutral"
            />
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

          <div className="section-title">Leads asignados vs. ganados por {DIMENSION_LABEL[dimension].toLowerCase()}</div>
          <div className="card">
            {topRows.length ? (
              <BarChart
                rows={topRows}
                series={[
                  { name: "Leads asignados", color: "var(--series-1)" },
                  { name: "Ganados", color: "var(--series-2)" },
                ]}
                formatValue={formatNumber}
                onRowClick={canDrillDeeper ? handleDrill : undefined}
              />
            ) : (
              <div className="empty">Sin datos en el rango seleccionado.</div>
            )}
          </div>

          <div className="section-title">Cierres por {DIMENSION_LABEL[dimension].toLowerCase()}</div>
          <div className="card">
            {topCierreRows.length ? (
              <BarChart
                rows={topCierreRows}
                series={[{ name: "Cierres", color: "var(--good)" }]}
                formatValue={formatNumber}
                onRowClick={canDrillDeeper ? handleDrill : undefined}
              />
            ) : (
              <div className="empty">Sin cierres en el rango seleccionado.</div>
            )}
          </div>

          <div className="section-title">Detalle por {DIMENSION_LABEL[dimension].toLowerCase()}</div>
          <div className="card">
            <MetricsTable
              rows={rows}
              totals={totals}
              dimensionLabel={DIMENSION_LABEL[dimension]}
              onRowClick={canDrillDeeper ? handleDrill : undefined}
            />
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
