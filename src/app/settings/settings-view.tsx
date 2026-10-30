"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, inputCls } from "@/components/ui/field";
import { saveDepartment, saveLeaveRule, saveLocation, setWeeklyOffs } from "@/modules/settings/actions";
import type { DepartmentCfg, LeaveTypeCfg, LocationCfg } from "@/modules/settings/queries";

type Data = { leaveTypes: LeaveTypeCfg[]; locations: LocationCfg[]; departments: DepartmentCfg[]; year: number };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ACCRUAL = [["upfront_prorated", "Credited upfront, pro-rated for joiners"], ["monthly", "Earned monthly"], ["on_request", "On request"], ["none", "Not applicable"]];
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
type Tab = "leave" | "departments" | "locations";

export function SettingsView({ data, states }: { data: Data; states: { code: string; name: string }[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("leave");
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setError(null); setNotice(null);
    start(async () => { const r = await fn(); if (r.ok) { setNotice(done); router.refresh(); } else setError(r.error ?? "Could not save"); });
  };
  return (
    <>
      {notice && <p role="status" className="mb-3 rounded-lg bg-st-present-bg p-3 text-sm text-st-present">{notice}</p>}
      {error && <p role="alert" className="mb-3 rounded-lg border border-danger p-3 text-sm text-danger">{error}</p>}
      <div role="tablist" aria-label="Settings sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {([["leave", "Leave types"], ["departments", "Departments"], ["locations", "Locations and weekly offs"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setNotice(null); setError(null); }}
            className={clsx("shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium", tab === k ? "border-primary text-primary" : "border-transparent text-muted hover:text-text")}>{l}</button>))}
        <Link href="/holidays" className="shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-primary underline">Holidays</Link>
      </div>

      {tab === "leave" && (
        <div className="flex max-w-3xl flex-col gap-4">
          <p className="text-sm text-muted">Rules for {data.year}. A change here applies from {data.year} and is checked by the database whenever leave is applied for or approved. Past years cannot be edited.</p>
          {data.leaveTypes.map((t) => <LeaveRuleCard key={t.id} t={t} year={data.year} busy={busy} onSave={(i) => run(() => saveLeaveRule(i), `${t.code} rule saved.`)} />)}
        </div>
      )}

      {tab === "departments" && (
        <div className="max-w-xl">
          <Card><CardBody className="flex flex-col divide-y divide-border p-0">
            {data.departments.map((d) => <DeptRow key={d.id} d={d} busy={busy} onSave={(name, active) => run(() => saveDepartment({ id: d.id, name, active }), "Department saved.")} />)}
          </CardBody></Card>
          <AddDepartment busy={busy} onAdd={(name) => run(() => saveDepartment({ name }), "Department added.")} />
        </div>
      )}

      {tab === "locations" && (
        <div className="flex max-w-3xl flex-col gap-4">
          {data.locations.map((l) => <LocationCard key={l.id} l={l} busy={busy} states={states}
            onOffs={(days, effective) => run(() => setWeeklyOffs({ locationId: l.id, days, effective }), `Weekly offs for ${l.name} saved.`)}
            onSave={(v) => run(() => saveLocation({ id: l.id, ...v }), "Location saved.")} />)}
          <AddLocation states={states} busy={busy} onAdd={(v) => run(() => saveLocation(v), "Location added. Set its weekly offs next.")} />
        </div>
      )}
    </>
  );
}

function LeaveRuleCard({ t, year, busy, onSave }: { t: LeaveTypeCfg; year: number; busy: boolean; onSave: (i: Parameters<typeof saveLeaveRule>[0]) => void }) {
  const [f, setF] = useState({ quota: t.annualQuota?.toString() ?? "", accrual: t.accrual, perMonth: t.accrualPerMonth?.toString() ?? "", carry: t.carryForwardMax?.toString() ?? "", half: t.halfDay, doc: t.docOverDays?.toString() ?? "", max: t.maxPerRequest?.toString() ?? "", minService: t.minServiceDays?.toString() ?? "" });
  return (
    <Card><CardBody>
      <h2 className="mb-3 text-base font-semibold">{t.name} <span className="font-normal text-muted">({t.code}){t.eventBased ? " · event based" : ""}</span></h2>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave({ typeId: t.id, year, annualQuota: numOrNull(f.quota), accrual: f.accrual, accrualPerMonth: numOrNull(f.perMonth), carryForwardMax: numOrNull(f.carry), halfDay: f.half, docOverDays: numOrNull(f.doc), maxPerRequest: numOrNull(f.max), minServiceDays: numOrNull(f.minService) }); }}>
        <Field id={`q-${t.id}`} label="Annual quota (days)"><input id={`q-${t.id}`} className={inputCls} inputMode="decimal" value={f.quota} onChange={(e) => setF({ ...f, quota: e.target.value })} /></Field>
        <Field id={`a-${t.id}`} label="How it accrues"><select id={`a-${t.id}`} className={inputCls} value={f.accrual} onChange={(e) => setF({ ...f, accrual: e.target.value })}>{ACCRUAL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        {f.accrual === "monthly" && <Field id={`m-${t.id}`} label="Days earned per month"><input id={`m-${t.id}`} className={inputCls} inputMode="decimal" value={f.perMonth} onChange={(e) => setF({ ...f, perMonth: e.target.value })} /></Field>}
        <Field id={`c-${t.id}`} label="Carry-forward limit (days)" hint="Empty or 0: lapses at year end"><input id={`c-${t.id}`} className={inputCls} inputMode="decimal" value={f.carry} onChange={(e) => setF({ ...f, carry: e.target.value })} /></Field>
        <Field id={`d-${t.id}`} label="Certificate needed over (days)" hint="Empty: never"><input id={`d-${t.id}`} className={inputCls} inputMode="numeric" value={f.doc} onChange={(e) => setF({ ...f, doc: e.target.value })} /></Field>
        <Field id={`x-${t.id}`} label="Maximum days per request" hint="Empty: no limit"><input id={`x-${t.id}`} className={inputCls} inputMode="decimal" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></Field>
        <Field id={`s-${t.id}`} label="Minimum service (days)" hint="Empty: none"><input id={`s-${t.id}`} className={inputCls} inputMode="numeric" value={f.minService} onChange={(e) => setF({ ...f, minService: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4" checked={f.half} onChange={(e) => setF({ ...f, half: e.target.checked })} /> Half day allowed</label>
        <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save {t.code} rule</Button></div>
      </form>
    </CardBody></Card>
  );
}

function DeptRow({ d, busy, onSave }: { d: DepartmentCfg; busy: boolean; onSave: (name: string, active: boolean) => void }) {
  const [name, setName] = useState(d.name);
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <label className="sr-only" htmlFor={`dn-${d.id}`}>Department name</label>
      <input id={`dn-${d.id}`} className={clsx(inputCls, "min-w-0 flex-1")} value={name} onChange={(e) => setName(e.target.value)} />
      <span className="text-xs text-muted">{d.people} active</span>
      <Button size="sm" variant="secondary" disabled={busy || name.trim() === d.name} onClick={() => onSave(name, d.active)}>Rename</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(d.name, !d.active)}>{d.active ? "Deactivate" : "Activate"}</Button>
    </div>
  );
}

function AddDepartment({ busy, onAdd }: { busy: boolean; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName(""); } }}>
      <label className="sr-only" htmlFor="new-dept">New department</label>
      <input id="new-dept" className={clsx(inputCls, "flex-1")} placeholder="New department name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" disabled={busy || !name.trim()}>Add</Button>
    </form>
  );
}

function LocationCard({ l, busy, states, onOffs, onSave }: { l: LocationCfg; busy: boolean; states: { code: string; name: string }[]; onOffs: (days: number[], effective: string) => void; onSave: (v: { name: string; city: string; state: string; active: boolean }) => void }) {
  const [days, setDays] = useState<number[]>(l.weeklyOffs);
  const [effective, setEffective] = useState("");
  const [v, setV] = useState({ name: l.name, city: l.city, state: l.state });
  return (
    <Card><CardBody className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={`ln-${l.id}`} label="Name"><input id={`ln-${l.id}`} className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field id={`lc-${l.id}`} label="City"><input id={`lc-${l.id}`} className={inputCls} value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} /></Field>
        <Field id={`ls-${l.id}`} label="State"><select id={`ls-${l.id}`} className={inputCls} value={v.state} onChange={(e) => setV({ ...v, state: e.target.value })}>{states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
      </div>
      <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={busy} onClick={() => onSave({ ...v, active: l.active })}>Save details</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave({ ...v, active: !l.active })}>{l.active ? "Deactivate" : "Activate"}</Button></div>
      <fieldset className="border-t border-border pt-3">
        <legend className="mb-2 text-sm font-semibold">Weekly offs</legend>
        <div className="flex flex-wrap gap-3">{DAYS.map((n, i) => (
          <label key={n} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4" checked={days.includes(i + 1)} onChange={(e) => setDays(e.target.checked ? [...days, i + 1] : days.filter((x) => x !== i + 1))} /> {n}</label>))}</div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field id={`le-${l.id}`} label="Applies from" hint="A date in the future is safest; payroll-exported months can't change"><input id={`le-${l.id}`} type="date" className={inputCls} value={effective} onChange={(e) => setEffective(e.target.value)} /></Field>
          <Button disabled={busy || !effective || days.length === 0} onClick={() => onOffs(days, effective)}>Save weekly offs</Button>
        </div>
      </fieldset>
    </CardBody></Card>
  );
}

function AddLocation({ states, busy, onAdd }: { states: { code: string; name: string }[]; busy: boolean; onAdd: (v: { name: string; city: string; state: string }) => void }) {
  const [v, setV] = useState({ name: "", city: "", state: "GA" });
  return (
    <Card><CardBody>
      <h2 className="mb-3 text-base font-semibold">Add a location</h2>
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); onAdd(v); setV({ name: "", city: "", state: "GA" }); }}>
        <Field id="nl-name" label="Name"><input id="nl-name" className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field id="nl-city" label="City"><input id="nl-city" className={inputCls} value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} /></Field>
        <Field id="nl-state" label="State"><select id="nl-state" className={inputCls} value={v.state} onChange={(e) => setV({ ...v, state: e.target.value })}>{states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
        <div className="flex items-end"><Button type="submit" disabled={busy || !v.name.trim() || !v.city.trim()}>Add</Button></div>
      </form>
    </CardBody></Card>
  );
}
