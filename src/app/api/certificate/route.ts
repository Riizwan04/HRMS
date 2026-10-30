import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { q, withUser } from "@/lib/db/client";

// Streams a certificate only if the database lets the signed-in user see the leave request that owns it
// (the owner, their manager, or HR: RLS on leave_requests). There is no public URL.
export async function GET(req: Request) {
  const me = await requireEmployee();
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return new NextResponse("Not found", { status: 404 });
  const [rows] = await withUser({ sub: me.sub }, [q`select 1 from public.leave_requests where attachment_path = ${path}::text limit 1`]);
  if (rows.length === 0) return new NextResponse("Not found", { status: 404 });
  const blob = await get(path, { access: "private" });
  if (!blob || blob.statusCode !== 200) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(blob.stream, { headers: { "Content-Type": blob.blob.contentType, "Cache-Control": "private, no-store" } });
}
