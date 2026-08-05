/**
 * One-off setup script. Run once (npm run setup:kommo) before turning on the
 * n8n sync workflows. It is idempotent — safe to re-run.
 *
 * What it does:
 *   1. Lists existing Kommo lead custom fields, and tries to locate the
 *      campaign/adset/ad fields that already exist in the account.
 *   2. Creates the 5 custom fields this project needs and Kommo doesn't
 *      have yet: fecha_agenda, fecha_cita_asistida, fecha_cotizacion,
 *      fecha_por_cerrar, fecha_cierre (type date_time). Skips any that
 *      already exist (matched by name).
 *   3. Pulls pipelines/statuses and loss reasons, and writes them into
 *      kommo_statuses / kommo_loss_reasons in Postgres.
 *   4. Registers a webhook pointing at the n8n won/lost workflow, if one
 *      to that destination doesn't already exist.
 *   5. Writes every discovered/created field id into kommo_field_map
 *      (Postgres) AND into n8n/field-map.generated.json, so the values are
 *      easy to paste into the n8n workflow's "Config" Set node.
 *
 * Required env vars (see .env.example):
 *   KOMMO_BASE_URL, KOMMO_API_TOKEN, DATABASE_URL, N8N_WON_LOST_WEBHOOK_URL
 * Optional (name hints for fields that already exist in the account):
 *   KOMMO_CAMPAIGN_FIELD_NAME (default: "campaign")
 *   KOMMO_ADSET_FIELD_NAME    (default: "adset")
 *   KOMMO_AD_FIELD_NAME       (default: "ad")
 */
import { Client } from "pg";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const KOMMO_BASE_URL = requireEnv("KOMMO_BASE_URL").replace(/\/+$/, "");
const KOMMO_API_TOKEN = requireEnv("KOMMO_API_TOKEN");
const DATABASE_URL = requireEnv("DATABASE_URL");
const N8N_WON_LOST_WEBHOOK_URL = requireEnv("N8N_WON_LOST_WEBHOOK_URL");

const CAMPAIGN_FIELD_NAME = (process.env.KOMMO_CAMPAIGN_FIELD_NAME ?? "campaign").toLowerCase();
const ADSET_FIELD_NAME = (process.env.KOMMO_ADSET_FIELD_NAME ?? "adset").toLowerCase();
const AD_FIELD_NAME = (process.env.KOMMO_AD_FIELD_NAME ?? "ad").toLowerCase();

// Kommo/amoCRM allows up to 7 req/s; stay well under it per project requirements.
const REQUEST_DELAY_MS = 350; // ~3 req/s

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function kommoFetch(pathname: string, init?: RequestInit) {
  await sleep(REQUEST_DELAY_MS);
  const res = await fetch(`${KOMMO_BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KOMMO_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kommo API ${init?.method ?? "GET"} ${pathname} -> ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

type KommoCustomField = { id: number; name: string; type: string };

async function listLeadCustomFields(): Promise<KommoCustomField[]> {
  const fields: KommoCustomField[] = [];
  let page = 1;
  for (;;) {
    const data: any = await kommoFetch(`/api/v4/leads/custom_fields?page=${page}&limit=250`);
    const pageFields = data?._embedded?.custom_fields ?? [];
    fields.push(...pageFields);
    if (!data?._links?.next) break;
    page += 1;
  }
  return fields;
}

async function createDateTimeField(name: string): Promise<number> {
  const data: any = await kommoFetch("/api/v4/leads/custom_fields", {
    method: "POST",
    body: JSON.stringify([{ name, type: "date_time" }]),
  });
  const created = data?._embedded?.custom_fields?.[0];
  if (!created?.id) {
    throw new Error(`Unexpected response creating custom field "${name}": ${JSON.stringify(data)}`);
  }
  return created.id;
}

async function fetchPipelinesWithStatuses() {
  const data: any = await kommoFetch("/api/v4/leads/pipelines?with=statuses");
  return (data?._embedded?.pipelines ?? []) as Array<{
    id: number;
    name: string;
    _embedded: { statuses: Array<{ id: number; name: string; sort: number; type?: number }> };
  }>;
}

async function fetchLossReasons() {
  const data: any = await kommoFetch("/api/v4/leads/loss_reasons?limit=250");
  return (data?._embedded?.loss_reasons ?? []) as Array<{ id: number; name: string }>;
}

async function findExistingWebhook(destination: string): Promise<boolean> {
  const data: any = await kommoFetch("/api/v4/webhooks");
  const hooks = data?._embedded?.webhooks ?? [];
  return hooks.some((h: any) => h.destination === destination);
}

async function registerWonLostWebhook(destination: string) {
  const exists = await findExistingWebhook(destination);
  if (exists) {
    console.log(`Webhook already registered for ${destination}, skipping.`);
    return;
  }
  // NOTE: verify against current Kommo webhooks catalog once account access is
  // confirmed — "update_lead" fires on any lead field/status change, which the
  // n8n workflow then filters down to won/lost transitions using the payload's
  // status_id against kommo_statuses.
  await kommoFetch("/api/v4/webhooks", {
    method: "POST",
    body: JSON.stringify({
      destination,
      settings: ["update_lead", "add_lead"],
    }),
  });
  console.log(`Registered webhook -> ${destination}`);
}

// Kommo's two "special" status ids (142 = won, 143 = lost) are fixed and
// consistent across every pipeline in an account. The status object's
// numeric `type` field is NOT a won/lost indicator in practice — Kommo sets
// type=1 on each pipeline's first/incoming status (e.g. "Leads Entrantes"),
// not on 142/143 — so classification must rely on id alone.
function classifyStatus(status: { id: number }): "open" | "won" | "lost" {
  if (status.id === 142) return "won";
  if (status.id === 143) return "lost";
  return "open";
}

async function main() {
  console.log("== Kommo setup: reading existing custom fields ==");
  const existingFields = await listLeadCustomFields();

  const findByName = (needle: string) =>
    existingFields.find((f) => f.name.toLowerCase().includes(needle));

  const campaignField = findByName(CAMPAIGN_FIELD_NAME);
  const adsetField = findByName(ADSET_FIELD_NAME);
  const adField = findByName(AD_FIELD_NAME);

  if (!campaignField) console.warn(`WARNING: no existing field matched "${CAMPAIGN_FIELD_NAME}" — set KOMMO_CAMPAIGN_FIELD_NAME.`);
  if (!adsetField) console.warn(`WARNING: no existing field matched "${ADSET_FIELD_NAME}" — set KOMMO_ADSET_FIELD_NAME.`);
  if (!adField) console.warn(`WARNING: no existing field matched "${AD_FIELD_NAME}" — set KOMMO_AD_FIELD_NAME.`);

  const findOrCreateDateTime = async (label: string, wantedName: string) => {
    const existing = findByName(wantedName.toLowerCase());
    if (existing) {
      console.log(`Field "${label}" already exists (id ${existing.id}, name "${existing.name}").`);
      return existing.id;
    }
    const id = await createDateTimeField(wantedName);
    console.log(`Created field "${wantedName}" (id ${id}).`);
    return id;
  };

  console.log("== Ensuring date_time fields exist ==");
  const agendaId = await findOrCreateDateTime("fecha_agenda", "fecha_agenda");
  const citaAsistidaId = await findOrCreateDateTime("fecha_cita_asistida", "fecha_cita_asistida");
  const cotizacionId = await findOrCreateDateTime("fecha_cotizacion", "fecha_cotizacion");
  const porCerrarId = await findOrCreateDateTime("fecha_por_cerrar", "fecha_por_cerrar");
  const cierreId = await findOrCreateDateTime("fecha_cierre", "fecha_cierre");

  console.log("== Fetching pipelines/statuses ==");
  const pipelines = await fetchPipelinesWithStatuses();

  console.log("== Fetching loss reasons ==");
  const lossReasons = await fetchLossReasons();

  console.log("== Registering won/lost webhook in n8n ==");
  await registerWonLostWebhook(N8N_WON_LOST_WEBHOOK_URL);

  console.log("== Writing catalogs + field map to Postgres ==");
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    await db.query("begin");

    for (const pipeline of pipelines) {
      for (const status of pipeline._embedded?.statuses ?? []) {
        await db.query(
          `insert into kommo_statuses (pipeline_id, status_id, pipeline_name, status_name, sort, status_type)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (pipeline_id, status_id) do update set
             pipeline_name = excluded.pipeline_name,
             status_name = excluded.status_name,
             sort = excluded.sort,
             status_type = excluded.status_type`,
          [pipeline.id, status.id, pipeline.name, status.name, status.sort, classifyStatus(status)]
        );
      }
    }

    for (const reason of lossReasons) {
      await db.query(
        `insert into kommo_loss_reasons (loss_reason_id, name)
         values ($1, $2)
         on conflict (loss_reason_id) do update set name = excluded.name`,
        [reason.id, reason.name]
      );
    }

    const fieldMap: Record<string, { id: number; name: string } | null> = {
      agenda: { id: agendaId, name: "fecha_agenda" },
      cita_asistida: { id: citaAsistidaId, name: "fecha_cita_asistida" },
      cotizacion: { id: cotizacionId, name: "fecha_cotizacion" },
      por_cerrar: { id: porCerrarId, name: "fecha_por_cerrar" },
      cierre: { id: cierreId, name: "fecha_cierre" },
      campaign: campaignField ? { id: campaignField.id, name: campaignField.name } : null,
      adset: adsetField ? { id: adsetField.id, name: adsetField.name } : null,
      ad: adField ? { id: adField.id, name: adField.name } : null,
    };

    for (const [key, value] of Object.entries(fieldMap)) {
      if (!value) continue;
      await db.query(
        `insert into kommo_field_map (field_key, field_id, field_name)
         values ($1, $2, $3)
         on conflict (field_key) do update set field_id = excluded.field_id, field_name = excluded.field_name`,
        [key, value.id, value.name]
      );
    }

    await db.query("commit");

    const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "n8n", "field-map.generated.json");
    writeFileSync(outPath, JSON.stringify(fieldMap, null, 2));
    console.log(`Field map written to ${outPath} — paste these ids into the n8n "Config" Set node.`);
  } catch (err) {
    await db.query("rollback");
    throw err;
  } finally {
    await db.end();
  }

  console.log("== Done ==");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
