import { NextRequest, NextResponse } from "next/server";
import { getFunnelReport } from "@/lib/metrics";
import type { Dimension } from "@/lib/types";

const VALID_DIMENSIONS: Dimension[] = ["campaign", "adset", "ad"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const dimensionParam = searchParams.get("dimension") ?? "campaign";
  const values = searchParams.get("values");
  const campaign = searchParams.get("campaign") ?? undefined;
  const adset = searchParams.get("adset") ?? undefined;

  if (!from || !to) {
    return NextResponse.json({ error: "Missing required query params: from, to (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!VALID_DIMENSIONS.includes(dimensionParam as Dimension)) {
    return NextResponse.json({ error: `dimension must be one of ${VALID_DIMENSIONS.join(", ")}` }, { status: 400 });
  }

  const report = await getFunnelReport({
    dimension: dimensionParam as Dimension,
    dateRange: { from, to },
    values: values ? values.split(",").filter(Boolean) : [],
    campaign,
    adset,
  });

  return NextResponse.json(report);
}
