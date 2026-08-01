import { NextRequest, NextResponse } from "next/server";
import { getFunnelReport } from "@/lib/metrics";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const asesores = searchParams.get("asesores");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing required query params: from, to (YYYY-MM-DD)" }, { status: 400 });
  }

  const report = await getFunnelReport({
    dimension: "asesor",
    dateRange: { from, to },
    values: asesores ? asesores.split(",").filter(Boolean) : [],
  });

  return NextResponse.json(report);
}
