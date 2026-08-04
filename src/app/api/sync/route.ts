import { NextResponse } from "next/server";

// Triggers the n8n "Kommo - Sync Full" workflow via its manual-run webhook
// and waits for it to finish (the webhook's responseMode is "lastNode"),
// so the dashboard can be sure Postgres is caught up with Kommo before
// re-reading the report.
export async function POST() {
  const url = process.env.N8N_SYNC_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json(
      { error: "N8N_SYNC_WEBHOOK_URL no está configurada en el servidor." },
      { status: 500 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    if (!res.ok) {
      return NextResponse.json(
        { error: `n8n respondió ${res.status} ${res.statusText}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError" ? "El sync tardó demasiado (timeout)." : "No se pudo contactar a n8n.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
