import { AppShell } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { getDecisions, getPendingApprovals } from "@/modules/approvals";
import { approvalItems, decidedItems, PREVIEW_ENABLED, type Role } from "@/lib/preview-data";
import { ApprovalsView } from "./approvals-view";

export const metadata = { title: "Approvals · Kinara" };

// ?state=empty and ?state=loading show the designed states; ?role=employee shows what a non-approver gets.
export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; state?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("manager", sp.role ?? "manager");
  const name = me.name;
  const role: Role = me.role;
  const items = me.demo ? approvalItems : await getPendingApprovals();
  const decided = me.demo ? decidedItems : await getDecisions();
  return (
    <AppShell demo={me.demo} liveData={!me.demo} role={role} active="approvals" enabled={PREVIEW_ENABLED} userName={name} dateLine={dateLineFor(me.demo)}>
      <h1 className="mb-4 text-2xl font-semibold">Approvals</h1>
      {role === "employee" ? (
        <Card><CardBody className="py-10 text-center"><p className="font-medium">You don&apos;t have access to this page</p>
          <p className="mt-1 text-sm text-muted">Approvals are for managers and HR. (The real app returns the same page as for a record that doesn&apos;t exist.)</p></CardBody></Card>
      ) : sp.state === "loading" ? (
        <div aria-busy="true" aria-label="Loading approvals" className="flex flex-col gap-4">
          <Skeleton className="h-10" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : (
        <ApprovalsView items={sp.state === "empty" ? [] : items} decided={decided} live={!me.demo} />
      )}
    </AppShell>
  );
}
