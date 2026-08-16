import { NextResponse } from "next/server";
import { buildWorkCatalog } from "./catalog";
import { POST as chatPost } from "../chat/route";

export const runtime = "nodejs";
export const maxDuration = 600;

/** The Work surface shares the execution POST contract with chat routing. */
export const POST = chatPost;

/** Keep the Work endpoint neutral; provider/model inventories belong elsewhere. */
export async function GET() {
  return NextResponse.json(buildWorkCatalog());
}
