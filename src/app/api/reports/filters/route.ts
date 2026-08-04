import { NextResponse } from "next/server";
import { listAsesores, listCampanas } from "@/lib/metrics";

export async function GET() {
  const [asesores, campanas] = await Promise.all([listAsesores(), listCampanas()]);

  // Full campaign/adset/ad combinations (not flattened) so the client can
  // derive the Meta-style hierarchy: which adsets belong to a campaign,
  // which ads belong to an adset.
  return NextResponse.json({ asesores, campanas });
}
