-- Kommo reporting schema
-- Single wide table per lead (kommo_leads), upserted in place by lead_id.
-- Small catalog tables refreshed on every sync run.
-- Run once against the Postgres instance created in EasyPanel before the
-- first n8n sync run.

create table if not exists kommo_leads (
  lead_id                 bigint primary key,
  name                    text,
  price                   numeric,

  pipeline_id             bigint,
  status_id               bigint,

  responsible_user_id     bigint,
  responsible_user_name   text,

  created_at              timestamptz,
  updated_at              timestamptz,
  closed_at               timestamptz,

  is_won                  boolean not null default false,
  is_lost                 boolean not null default false,

  loss_reason_id          bigint,
  loss_reason_name        text,

  campaign                text,
  adset                   text,
  ad                      text,

  fecha_agenda            timestamptz,
  fecha_cita_asistida     timestamptz,
  fecha_cotizacion        timestamptz,
  fecha_cierre            timestamptz,

  synced_at               timestamptz not null default now()
);

-- Idempotent for databases created before fecha_cierre existed.
alter table kommo_leads add column if not exists fecha_cierre timestamptz;

-- Filter/aggregation indexes. Every report query filters by one of these
-- date columns plus optionally responsible_user_id / campaign / adset / ad,
-- per the "date of the event, not date of lead creation" rule.
create index if not exists idx_kommo_leads_created_at        on kommo_leads (created_at);
create index if not exists idx_kommo_leads_closed_at         on kommo_leads (closed_at);
create index if not exists idx_kommo_leads_fecha_agenda      on kommo_leads (fecha_agenda);
create index if not exists idx_kommo_leads_fecha_asistida    on kommo_leads (fecha_cita_asistida);
create index if not exists idx_kommo_leads_fecha_cotizacion  on kommo_leads (fecha_cotizacion);
create index if not exists idx_kommo_leads_fecha_cierre      on kommo_leads (fecha_cierre);
create index if not exists idx_kommo_leads_responsible_user  on kommo_leads (responsible_user_id);
create index if not exists idx_kommo_leads_campaign          on kommo_leads (campaign);
create index if not exists idx_kommo_leads_adset             on kommo_leads (adset);
create index if not exists idx_kommo_leads_ad                on kommo_leads (ad);
create index if not exists idx_kommo_leads_status            on kommo_leads (pipeline_id, status_id);

-- Pipeline/status catalog, refreshed wholesale on each sync run.
create table if not exists kommo_statuses (
  pipeline_id   bigint not null,
  status_id     bigint not null,
  pipeline_name text,
  status_name   text,
  sort          integer,
  status_type   text check (status_type in ('open', 'won', 'lost')) not null default 'open',
  primary key (pipeline_id, status_id)
);

-- Loss reason catalog, refreshed wholesale on each sync run.
create table if not exists kommo_loss_reasons (
  loss_reason_id bigint primary key,
  name           text not null
);

-- Field-ID map discovered/created by scripts/setup-kommo.ts, kept here so
-- the mapping survives independent of the n8n workflow JSON and can be
-- looked up (e.g. by a debugging query or a future re-run of the script).
create table if not exists kommo_field_map (
  field_key text primary key, -- 'agenda' | 'cita_asistida' | 'cotizacion' | 'cierre' | 'campaign' | 'adset' | 'ad'
  field_id  bigint not null,
  field_name text
);

-- Which asesores/campañas exist, for populating filter dropdowns without
-- scanning the full leads table.
create or replace view kommo_asesores as
  select distinct responsible_user_id, responsible_user_name
  from kommo_leads
  where responsible_user_id is not null
  order by responsible_user_name;

create or replace view kommo_campanas as
  select distinct campaign, adset, ad
  from kommo_leads
  where campaign is not null or adset is not null or ad is not null;
