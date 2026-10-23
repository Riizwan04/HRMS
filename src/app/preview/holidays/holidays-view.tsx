"use client";

import clsx from "clsx";
import { AlertCircle, CalendarDays, Info, Plus, X } from "lucide-react";
import { useState } from "react";
import { RequestStatusBadge } from "@/components/request-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, inputCls } from "@/components/ui/field";
import type { HolidayRow, HolidayType } from "@/lib/preview-data";
import { formatDayShort, formatMonth } from "@/lib/time/ist";

type SiteKey = "ho" | "plant";
type Site = { key: SiteKey; name: string; week: string };
const TYPE: Record<HolidayType, { label: string; cls: string }> = {
  national: { label: "National", cls: "bg-st-holiday-bg text-st-holiday" },
  state: { label: "State", cls: "bg-st-leave-bg text-st-leave" },
  optional: { label: "Optional", cls: "bg-st-half-bg text-st-half" },
};
const QUOTA = 2;

export function HolidaysView({ sites, rows, mySite, start, today, isHr }: {
  sites: Site[]; rows: HolidayRow[]; mySite: SiteKey; start: Record<string, "pending" | "approved">; today: string; isHr: boolean;
}) {
  const [site, setSite] = useState<SiteKey>(mySite);
  const [mine, setMine] = useState(start);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const viewing = sites.find((s) => s.key === site)!;
  const own = site === mySite;
  const used = Object.keys(mine).length;
  const left = QUOTA - used;
  const list = rows.filter((r) => r.site === site);
  const months = [...new Set(list.map((r) => r.date.slice(0, 7)))];

  return (
    <>
      <fieldset className="mb-3">
        <legend className="mb-2 text-sm font-medium text-muted">Site</legend>
        <div className="flex flex-wrap gap-2">
          {sites.map((s) => (
            <label key={s.key} className={clsx("flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm",
              s.key === site ? "border-primary bg-surface ring-1 ring-primary" : "border-border bg-surface")}>
              <input type="radio" name="site" className="mt-1" checked={s.key === site} onChange={() => setSite(s.key)} />
              <span><span className="font-semibold">{s.name}</span>{s.key === mySite && <span className="ml-2 rounded-full bg-bg px-2 py-0.5 text-xs">your site</span>}<br /><span className="text-muted">{s.week}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      {!own && (
        <p className="mb-3 flex items-start gap-2 rounded-lg border border-info p-3 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> You are viewing {viewing.name}&apos;s calendar (read-only). Your site is {sites.find((s) => s.key === mySite)!.name}.
        </p>
      )}
      {notice && <p role="status" className="mb-3 rounded-lg bg-st-present-bg p-3 text-sm text-st-present">{notice}</p>}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {own ? <p className="text-sm text-muted">Optional holidays: <span className="font-semibold text-text">{left} of {QUOTA} left</span> in 2026. Each choice needs your manager&apos;s approval.</p> : <span />}
        {isHr && <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Add holiday</Button>}
      </div>

      {list.length === 0 ? (
        <Card><CardBody className="flex flex-col items-center gap-2 py-10 text-center"><CalendarDays className="size-8 text-muted" aria-hidden />
          <p className="font-medium">No holidays published for {viewing.name} 2026.</p><p className="text-sm text-muted">HR can add them.</p></CardBody></Card>
      ) : months.map((m) => (
        <section key={m} className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{formatMonth(`${m}-01`)}</h2>
          <Card><ul className="divide-y divide-border">
            {list.filter((r) => r.date.startsWith(m)).map((r) => {
              const st = mine[r.id];
              const future = r.date > today;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-sm text-muted">{formatDayShort(r.date)}{r.onWeeklyOff && " · falls on a Weekly Off here"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", TYPE[r.type].cls)}>{TYPE[r.type].label}</span>
                    {own && r.type === "optional" && st && <RequestStatusBadge status={st} />}
                    {own && r.type === "optional" && future && !st && (
                      <Button size="sm" variant="secondary" disabled={left === 0} onClick={() => { setMine({ ...mine, [r.id]: "pending" }); setNotice(`Requested ${r.name}. Your manager will approve it. (Sample)`); }}>Choose this day</Button>
                    )}
                    {own && r.type === "optional" && future && st && (
                      <Button size="sm" variant="ghost" onClick={() => { const { [r.id]: _gone, ...rest } = mine; void _gone; setMine(rest); setNotice(`Cancelled ${r.name}; the quota is free again. (Sample)`); }}>Cancel</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul></Card>
        </section>
      ))}
      {own && left === 0 && <p className="flex items-center gap-1.5 text-sm text-muted"><AlertCircle className="size-4" aria-hidden /> You&apos;ve already chosen 2 optional holidays for 2026.</p>}

      {adding && <AddHoliday sites={sites} existing={rows} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setNotice("Holiday saved. Any leave booked on that date is released and balances restored automatically. (Sample)"); }} />}
    </>
  );
}

function AddHoliday({ sites, existing, onClose, onSaved }: { sites: Site[]; existing: HolidayRow[]; onClose: () => void; onSaved: () => void }) {
  const [picked, setPicked] = useState<SiteKey[]>(["ho", "plant"]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<HolidayType>("state");
  const [touched, setTouched] = useState(false);
  const dup = date && existing.find((r) => picked.includes(r.site) && r.date === date);
  const errs = {
    sites: picked.length === 0 ? "Choose at least one site" : null,
    date: !date ? "Choose a date" : dup ? "A holiday already exists for this site on that date" : null,
    name: name.trim() === "" ? "Enter the holiday name" : null,
  };
  const bad = Object.values(errs).some(Boolean);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label="Add holiday" onClick={(e) => e.stopPropagation()} noValidate
        onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!bad) onSaved(); }}
        className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl bg-surface p-5 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Add holiday</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 hover:bg-bg"><X className="size-5" aria-hidden /></button></div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Sites *</legend>
          {sites.map((s) => (
            <label key={s.key} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" className="size-4" checked={picked.includes(s.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.key] : picked.filter((k) => k !== s.key))} /> {s.name}
            </label>
          ))}
          {touched && errs.sites && <p role="alert" className="mt-1 flex items-center gap-1.5 text-sm text-danger"><AlertCircle className="size-4" aria-hidden /> {errs.sites}</p>}
        </fieldset>
        <Field id="hd" label="Date" required error={touched || dup ? errs.date : null}><input id="hd" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field id="hn" label="Name" required error={touched ? errs.name : null}><input id="hn" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field id="ht" label="Type" required><select id="ht" className={inputCls} value={type} onChange={(e) => setType(e.target.value as HolidayType)}>
          <option value="national">National</option><option value="state">State</option><option value="optional">Optional</option></select></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save holiday</Button></div>
      </form>
    </div>
  );
}
