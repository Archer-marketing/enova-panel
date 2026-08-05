import { NextResponse } from "next/server";

// Triggers the n8n "Kommo - Sync Full" workflow via its manual-run webhook.
// The webhook's responseMode is "onReceived", so n8n acks within
// milliseconds and keeps syncing in the background — we only need a short
// timeout here to confirm the trigger reached n8n, not the whole sync.
export async function POST() {
  const url = process.env.N8N_SYNC_WEBHOOK_URL;
  if (!url) {
    return NextResponse.json(
      { error: "N8N_SYNC_WEBHOOK_URL no está configurada en el servidor." },
      { status: 500 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

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
