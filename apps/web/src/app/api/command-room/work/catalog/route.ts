import { NextResponse } from "next/server";
import { buildWorkCatalog } from "../catalog";

export async function GET() {
  return NextResponse.json(buildWorkCatalog());
}
