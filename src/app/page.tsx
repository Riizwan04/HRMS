import Link from "next/link";
import { BalanceCard } from "@/components/balance-card";
import { AppShell } from "@/components/app-shell";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { displayName } from "@/lib/session";
import { formatDateTimeIST, formatTimeIST } from "@/lib/time/ist";
import { PREVIEW_ENABLED, sample, type Role } from "@/lib/preview-data";
import { CheckInCard } from "./check-in-card";

export const metadata = { title: "Dashboard · Kinara" };

const ROLES: { key: Role; label: string }[] = [
  { key: "employee", label: "Employee" }, { key: "manager", label: "Manager" }, { key: "hr", label: "HR Admin" },
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></Card>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const name = await displayName();
  const role: Role = sp.role === "manager" || sp.role === "hr" ? sp.role : "employee";
  const { team, org } = sample;

  return (
    <AppShell role={role} active="home" enabled={PREVIEW_ENABLED} userName={name} dateLine={formatDateTimeIST(sample.nowIso)}>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 text-sm">
        <span className="px-2 font-medium text-muted">Preview with sample data. View as:</span>
        {ROLES.map((r) => (
          <Link key={r.key} href={`/?role=${r.key}`}
            className={r.key === role ? "rounded-md bg-primary px-3 py-1.5 font-semibold text-on-primary" : "rounded-md px-3 py-1.5 font-medium text-primary hover:bg-surface-2"}>
            {r.label}
          </Link>
        ))}
      </div>

      <h1 className="mb-4 text-2xl font-semibold">Good morning, {name.split(" ")[0]}</h1>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
        <CheckInCard inTime={formatTimeIST(sample.checkInIso)} />
        <Card className="min-w-0">
          <CardHeader title="Leave balance (2026)" action={<LinkButton href={`/leave/apply?role=${role}`} size="sm" variant="secondary">Apply for leave</LinkButton>} />
          <CardBody className="flex gap-3 overflow-x-auto">
            {sample.balances.map((b) => <BalanceCard key={b.code} {...b} />)}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="My pending requests" />
        <CardBody className="flex flex-col divide-y divide-border p-0">
          {sample.pending.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm"><span className="mr-2 rounded-full border border-dashed border-input px-2 py-0.5 text-xs font-semibold">{p.kind}</span>{p.text}</p>
              <Button size="sm" variant="ghost">Cancel</Button>
            </div>
          ))}
        </CardBody>
      </Card>

      {(role === "manager" || role === "hr") && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title={`Team today (${team.present + team.wfh + team.leave + team.notIn})`} />
            <CardBody className="text-sm">Present {team.present} · WFH {team.wfh} · On leave {team.leave} · Not checked in {team.notIn}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Needs your decision" action={<LinkButton href={`/approvals?role=${role}`} size="sm">{team.decisions} pending</LinkButton>} />
            <CardBody className="text-sm text-muted">Leave, regularisation, WFH and optional-holiday requests from your team.</CardBody>
          </Card>
        </div>
      )}

      {role === "hr" && (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Active employees" value={org.active} />
          <Stat label="On leave today" value={org.onLeave} />
          <Stat label="Absent (no check-in)" value={org.absent} />
          <Stat label="Invites pending" value={org.invites} />
          <Stat label="Missing check-outs" value={org.missingOut} />
        </div>
      )}
    </AppShell>
  );
}
