import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { exportMonthCsv } from "@/modules/reports";

// Month-end summary CSV. Managers get their direct reports, HR gets everyone; the database function decides, and each download is logged.
export async function GET(req: Request) {
  await requireRole("manager");
  const u = new URL(req.url);
  const month = u.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new NextResponse("Bad month", { status: 400 });
  try {
    const { csv, filename } = await exportMonthCsv(month, { locationId: u.searchParams.get("location") ?? undefined, departmentId: u.searchParams.get("department") ?? undefined });
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" } });
  } catch {
    return new NextResponse("Not allowed", { status: 403 });
  }
}
