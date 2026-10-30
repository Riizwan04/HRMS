import { AppShell } from "@/components/app-shell";
import { requireEmployee } from "@/lib/auth";
import { formatDateTimeIST } from "@/lib/time/ist";
import { leaveScenarios, PREVIEW_ENABLED, sample, type Role } from "@/lib/preview-data";
import { ApplyForm } from "./apply-form";

export const metadata = { title: "Apply for leave · Kinara" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const me = await requireEmployee(sp.role);
  const name = me.name;
  const role: Role = me.role;
  return (
    <AppShell demo={me.demo} role={role} active="leave" enabled={PREVIEW_ENABLED} userName={name} dateLine={formatDateTimeIST(sample.nowIso)}>
      <h1 className="mb-4 text-2xl font-semibold">Apply for leave</h1>
      <ApplyForm scenarios={leaveScenarios} manager="Mohan Manager" />
    </AppShell>
  );
}
