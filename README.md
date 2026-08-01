# Reportes Kommo — Asesores y Campañas

Panel de reporting sobre datos de Kommo CRM: dos vistas (`/asesores` y
`/campanas`) sobre el mismo embudo (asignado → agenda → cita asistida →
cotización → cierre/pérdida), filtrables por fecha y por asesor o
campaña/adset/ad. Ver el plan completo en
`C:\Users\amega\.claude\plans\quiero-hacer-2-reportes-composed-wombat.md`
para el contexto y las decisiones de diseño.

## Estado de este entregable

Git, Node.js y npm se instalaron en esta máquina (vía `winget`), el repo ya
tiene su primer commit, `npm install` corrió sin vulnerabilidades
(`npm audit` → 0), y `npm run build` compila limpio con Next.js 16.2.12
(TypeScript sin errores, las 7 rutas generadas correctamente). También se
levantó `npm run start` localmente y se confirmó:

- `/asesores` y `/campanas` responden 200 y renderizan.
- Las rutas `/api/reports/*` fallan con 500 controlado (`Missing
  DATABASE_URL`) porque aún no hay un Postgres real — es el comportamiento
  esperado sin credenciales; el frontend ya lo muestra como mensaje de error
  en vez de quedarse cargando indefinidamente.

Lo que falta para que funcione de punta a punta es exclusivamente conectar
servicios externos reales (no se puede simular sin tus credenciales):

1. Un Postgres real (EasyPanel) con `db/schema.sql` aplicado.
2. Acceso a tu cuenta de Kommo para correr `scripts/setup-kommo.ts`.
3. Tu instancia de n8n para importar y activar los workflows.
4. Subir este repo a GitHub/GitLab para que EasyPanel construya la app
   "App" desde él.

Los workflows de n8n (`n8n/*.json`) están escritos a mano contra el patrón
estándar de nodos Postgres/Code de n8n (no se pudieron importar contra una
instancia real desde aquí); revisa que el nodo Postgres coincida con la
versión de tu instancia al importarlos — si difiere, reconstruye ese nodo
con el SQL que ya está en el JSON, que es la parte que importa.

## Prerrequisitos (credenciales que debes proveer)

- **Kommo**: subdominio de la cuenta + API token de larga duración con
  permisos sobre leads, custom fields, pipelines y webhooks.
- **EasyPanel**: API key y el proyecto `panel` (se crea si no existe).
- **n8n**: URL base + credenciales de tu instancia existente, alcanzable
  públicamente para que Kommo pueda enviarle webhooks.
- Un repositorio git donde EasyPanel pueda construir la app.

## Orden de puesta en marcha

1. **Postgres**: crea el servicio Postgres en el proyecto `panel` de
   EasyPanel, luego corre `db/schema.sql` contra esa base
   (`psql $DATABASE_URL -f db/schema.sql`).
2. **Setup de Kommo** (una sola vez): copia `.env.example` a `.env`, rellena
   `KOMMO_BASE_URL`, `KOMMO_API_TOKEN`, `DATABASE_URL` y
   `N8N_WON_LOST_WEBHOOK_URL` (la URL del webhook del workflow
   `kommo-won-lost-webhook.json`, aún inactivo, que puedes ver en n8n antes
   de activarlo), luego `npm run setup:kommo`. Esto:
   - crea los custom fields `fecha_agenda`, `fecha_cita_asistida`,
     `fecha_cotizacion` en Kommo (si no existen),
   - localiza los custom fields de campaña/adset/ad ya existentes,
   - sincroniza pipelines/statuses y razones de pérdida a Postgres,
   - registra el webhook en Kommo,
   - escribe `n8n/field-map.generated.json` con todos los IDs de campos
     descubiertos/creados.
3. **n8n**: en tu instancia, define las variables de entorno listadas al
   final de `.env.example` (usando los valores de
   `n8n/field-map.generated.json`), importa `n8n/kommo-sync-full.json` y
   `n8n/kommo-won-lost-webhook.json`, conecta la credencial de Postgres en
   cada nodo Postgres, y actívalos. Corre `kommo-sync-full` manualmente una
   vez para la carga histórica inicial.
4. **Dashboard**: despliega la app Next.js como servicio "App" en el
   proyecto `panel` de EasyPanel (build desde el repo git), con
   `DATABASE_URL` apuntando al mismo Postgres.

## Arquitectura

```
Kommo CRM ──(hourly poll, ~3 req/s)──▶ n8n "kommo-sync-full"      ──▶ Postgres
Kommo CRM ──(webhook status change)──▶ n8n "kommo-won-lost-webhook" ──▶ Postgres
Postgres ◀──(SQL vía pg)── Next.js dashboard (solo lectura)
```

- `kommo-sync-full` es la fuente de verdad: pagina todos los leads cada
  hora, respetando el límite de 3 req/s, y sobrescribe la fila completa de
  cada lead (`ON CONFLICT (lead_id) DO UPDATE`).
- `kommo-won-lost-webhook` es una optimización de frescura: cuando Kommo
  notifica un cambio de lead, refresca esa fila de inmediato si el lead
  quedó ganado o perdido, sin esperar la corrida horaria.
- El dashboard nunca escribe a Kommo ni a n8n; solo lee Postgres.

## Semántica de fechas (importante)

Cada métrica filtra por **su propio campo de fecha**, no por la fecha de
creación del lead — así lo pidió el usuario ("las fechas se trabajan por
cuándo sucedió, no cuándo se generó el lead"):

| Métrica | Columna de fecha usada |
|---|---|
| Leads asignados / activos | `created_at` |
| Perdidos | `closed_at` (con `is_lost`) |
| Ganados / Cierres | `closed_at` (con `is_won`) |
| Citas agendadas | `fecha_agenda` |
| Citas asistidas | `fecha_cita_asistida` |
| Cotizaciones | `fecha_cotizacion` |

Ver `src/lib/metrics.ts` para la implementación exacta (agregación con
`FILTER (WHERE columna BETWEEN $from AND $to)` por métrica).

## Estructura del proyecto

```
db/schema.sql                  — tablas y vistas en Postgres
scripts/setup-kommo.ts         — setup one-off de custom fields/webhook en Kommo
n8n/kommo-sync-full.json       — workflow n8n: sync horario completo
n8n/kommo-won-lost-webhook.json— workflow n8n: refresco inmediato de ganados/perdidos
src/lib/db.ts                  — pool de Postgres (pg)
src/lib/metrics.ts             — queries agregadas del embudo, parametrizadas por dimensión
src/lib/types.ts               — tipos compartidos del reporte
src/app/asesores/page.tsx      — reporte por asesor
src/app/campanas/page.tsx      — reporte por campaña/adset/ad
src/app/api/reports/*          — endpoints que exponen metrics.ts al frontend
src/components/*               — FilterBar, tabla de métricas, gráficas, stat tiles
```

## Decisiones y supuestos a confirmar con el uso real

- **Leads asignados** = `created_at` del lead (no se reconstruye historial
  de reasignación vía Kommo Events API). Revisar si esto basta en la
  práctica.
- **Valor cotizado** = mismo campo `price` del lead (no hay custom field
  separado de valor cotizado).
- Se reutilizan `closed_at` y `loss_reason_id` nativos de Kommo para
  cierre/pérdida en vez de crear custom fields duplicados.
- Los status "ganado"/"perdido" se identifican por `status.type` (1/2) si
  el API lo expone, o por los IDs fijos 142/143 como respaldo — confirmar
  contra la cuenta real una vez haya acceso.
- El evento de webhook de Kommo usado es `update_lead` (dispara en
  cualquier cambio del lead; el workflow filtra a ganado/perdido). Verificar
  contra el catálogo de eventos disponible en la cuenta real.
- Moneda de formato: MXN (`src/lib/format.ts`), cámbiala si aplica.
- Sin autenticación en el dashboard (MVP interno, según lo acordado).

## Verificación end-to-end (una vez con credenciales)

1. `GET {KOMMO_BASE_URL}/api/v4/leads/custom_fields` y `/api/v4/webhooks`
   para confirmar que el setup creó los 3 campos y el webhook.
2. Correr `kommo-sync-full` manualmente en n8n y revisar
   `select count(*) from kommo_leads;` en Postgres.
3. Cambiar un lead a ganado/perdido en Kommo y confirmar que
   `kommo-won-lost-webhook` actualiza esa fila en segundos.
4. Abrir `/asesores` y `/campanas`, filtrar por un asesor/campaña y rango de
   fechas conocidos, y comparar 2-3 números contra Kommo directamente.

## Siguientes pasos (fuera de este entregable)

- Aplicar branding (logo, colores, tipografía) al dashboard una vez
  validado el MVP — la paleta actual (`src/app/globals.css`) es un
  placeholder neutro validado para accesibilidad, listo para swap.
- Evaluar reconstruir el historial real de asignación (Kommo Events API) si
  `created_at` resulta insuficiente.
