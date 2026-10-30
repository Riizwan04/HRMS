import { AppShell } from "@/components/app-shell";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireEmployee } from "@/lib/auth";
import { formatDateTimeIST, todayIST } from "@/lib/time/ist";
import { leaveBalanceRows, leaveHistory, lopTaken, PREVIEW_ENABLED, sample, type Role } from "@/lib/preview-data";
import { LeaveView } from "./leave-view";

export const metadata = { title: "My leave · Kinara" };

// ?state=empty and ?state=loading show the designed empty and loading states (DESIGN.md section 7).
export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; state?: string }> }) {
  const sp = await searchParams;
  const me = await requireEmployee(sp.role);
  const name = me.name;
  const role: Role = me.role;
  return (
    <AppShell demo={me.demo} role={role} active="leave" enabled={PREVIEW_ENABLED} userName={name} dateLine={formatDateTimeIST(sample.nowIso)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My leave</h1>
        <LinkButton href={`/leave/apply?role=${role}`}>Apply for leave</LinkButton>
      </div>
      {sp.state === "loading" ? (
        <div aria-busy="true" aria-label="Loading leave" className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <LeaveView balances={leaveBalanceRows} lopTaken={lopTaken} history={sp.state === "empty" ? [] : leaveHistory}
          today={todayIST(new Date(sample.nowIso))} role={role} />
      )}
    </AppShell>
  );
}
