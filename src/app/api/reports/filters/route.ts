import { NextResponse } from "next/server";
import { listAsesores, listCampanas } from "@/lib/metrics";

export async function GET() {
  const [asesores, campanas] = await Promise.all([listAsesores(), listCampanas()]);

  const campaigns = [...new Set(campanas.map((c) => c.campaign).filter(Boolean))] as string[];
  const adsets = [...new Set(campanas.map((c) => c.adset).filter(Boolean))] as string[];
  const ads = [...new Set(campanas.map((c) => c.ad).filter(Boolean))] as string[];

  return NextResponse.json({ asesores, campaigns, adsets, ads });
}
