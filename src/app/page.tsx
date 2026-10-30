import Link from "next/link";
import { BalanceCard } from "@/components/balance-card";
import { AppShell } from "@/components/app-shell";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { formatRange, formatTimeIST, istTimeOfDay, nowIST, todayIST } from "@/lib/time/ist";
import { countPendingApprovals } from "@/modules/approvals";
import { getMyRequests, getOrgToday, getTeamToday, getToday } from "@/modules/attendance";
import { getBalances, getHistory } from "@/modules/leave";
import { PREVIEW_ENABLED, sample, type Role } from "@/lib/preview-data";
import { CheckInCard } from "./check-in-card";
import { CheckInLive } from "./check-in-live";
import { PendingList, type PendingRow } from "./pending-list";

export const metadata = { title: "Dashboard · Kinara" };

const ROLES: { key: Role; label: string }[] = [
  { key: "employee", label: "Employee" }, { key: "manager", label: "Manager" }, { key: "hr", label: "HR Admin" },
];

function Stat({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></Card>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const me = await requireEmployee(sp.role);
  const name = me.name;
  const role: Role = me.role;
  const live = !me.demo;
  const { team, org } = sample;
  const year = Number(todayIST().slice(0, 4));

  const real = live ? await (async () => {
    const [balances, leaves, requests, today] = await Promise.all([getBalances(year), getHistory(year), getMyRequests(), getToday()]);
    const isApprover = role === "manager" || role === "hr";
    const [teamToday, decisions, orgToday] = await Promise.all([
      isApprover ? getTeamToday() : null, isApprover ? countPendingApprovals() : 0, role === "hr" ? getOrgToday() : null,
    ]);
    const pending: PendingRow[] = [
      ...leaves.filter((l) => l.status === "pending").map((l) => ({ id: l.id, kind: "Leave" as const, text: `${l.type} · ${formatRange(l.from, l.to)} · ${l.days} day${l.days === 1 ? "" : "s"}` })),
      ...requests.filter((r) => r.status === "pending").map((r) => ({ id: r.id, kind: r.kind as PendingRow["kind"], text: r.text })),
    ];
    return { balances, pending, today, teamToday, decisions, orgToday };
  })() : null;

  const hour = Number(istTimeOfDay(nowIST()).slice(0, 2));
  const greeting = live ? (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening") : "Good morning";
  const t = real?.teamToday ?? team;

  return (
    <AppShell demo={me.demo} liveData={live} role={role} active="home" enabled={PREVIEW_ENABLED} userName={name} dateLine={dateLineFor(me.demo)}>
      {me.demo && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 text-sm">
        <span className="px-2 font-medium text-muted">Preview with sample data. View as:</span>
        {ROLES.map((r) => (
          <Link key={r.key} href={`/?role=${r.key}`}
            className={r.key === role ? "rounded-md bg-primary px-3 py-1.5 font-semibold text-on-primary" : "rounded-md px-3 py-1.5 font-medium text-primary hover:bg-surface-2"}>
            {r.label}
          </Link>
        ))}
      </div>}

      <h1 className="mb-4 text-2xl font-semibold">{greeting}, {name.split(" ")[0]}</h1>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_1fr]">
        {real ? <CheckInLive today={real.today} date={todayIST()} /> : <CheckInCard inTime={formatTimeIST(sample.checkInIso)} />}
        <Card className="min-w-0">
          <CardHeader title={`Leave balance (${year})`} action={<LinkButton href={live ? "/leave/apply" : `/leave/apply?role=${role}`} size="sm" variant="secondary">Apply for leave</LinkButton>} />
          <CardBody className="flex gap-3 overflow-x-auto">
            {(real ? real.balances.filter((b) => ["CL", "SL", "EL"].includes(b.code)) : sample.balances).map((b) => <BalanceCard key={b.code} code={b.code} name={b.name} available={b.available} pending={b.pending} />)}
          </CardBody>
          {live && <CardBody className="pt-0 text-sm"><Link href="/leave" className="font-medium text-primary underline">See the full breakdown and request history</Link></CardBody>}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="My pending requests" />
        <CardBody className="flex flex-col divide-y divide-border p-0">
          {real ? <PendingList rows={real.pending} /> : sample.pending.map((p) => (
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
            <CardHeader title={`${role === "hr" ? "Everyone" : "Team"} today (${t.present + t.wfh + t.leave + t.notIn})`} action={live ? <LinkButton href="/team" size="sm" variant="secondary">Details</LinkButton> : undefined} />
            <CardBody className="text-sm">Present {t.present} · WFH {t.wfh} · On leave {t.leave} · Not checked in {t.notIn}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Needs your decision" action={<LinkButton href={live ? "/approvals" : `/approvals?role=${role}`} size="sm">{real ? real.decisions : team.decisions} pending</LinkButton>} />
            <CardBody className="text-sm text-muted">Leave, regularisation, WFH and optional-holiday requests from your team.</CardBody>
          </Card>
        </div>
      )}

      {role === "hr" && (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Active employees" value={real?.orgToday?.active ?? org.active} />
          <Stat label="On leave today" value={real?.orgToday?.onLeave ?? org.onLeave} />
          <Stat label="Absent (no check-in)" value={real?.orgToday?.absent ?? org.absent} />
          <Stat label={live ? "Not signed in yet" : "Invites pending"} value={real?.orgToday?.notSignedIn ?? org.invites} />
          <Stat label="Missing check-outs" value={real?.orgToday?.missingOut ?? org.missingOut} />
        </div>
      )}
    </AppShell>
  );
}
