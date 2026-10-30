import { AppShell } from "@/components/app-shell";
import { requireEmployee } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { leaveScenarios, PREVIEW_ENABLED, type Role } from "@/lib/preview-data";
import { todayIST } from "@/lib/time/ist";
import { getBalances, getLeaveTypes } from "@/modules/leave";
import { ApplyForm } from "./apply-form";
import { ApplyFormLive } from "./apply-form-live";

export const metadata = { title: "Apply for leave · Samudra" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const me = await requireEmployee(sp.role);
  const role: Role = me.role;
  const year = Number(todayIST().slice(0, 4));
  const [types, balances] = me.demo ? [[], []] : await Promise.all([getLeaveTypes(year), getBalances(year)]);
  const options = types.map((t) => ({ id: t.id, code: t.code, name: t.name, halfDayAllowed: t.halfDayAllowed, available: balances.find((b) => b.typeId === t.id)?.available ?? null }));
  return (
    <AppShell demo={me.demo} liveData={!me.demo} role={role} active="leave" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(me.demo)}>
      <h1 className="mb-4 text-2xl font-semibold">Apply for leave</h1>
      {me.demo ? <ApplyForm scenarios={leaveScenarios} manager="Mohan Manager" /> : <ApplyFormLive types={options} manager={me.managerName} today={todayIST()} uploadsReady={Boolean(process.env.BLOB_READ_WRITE_TOKEN)} />}
    </AppShell>
  );
}
