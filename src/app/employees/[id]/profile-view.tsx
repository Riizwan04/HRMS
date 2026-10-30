"use client";

import clsx from "clsx";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, inputCls } from "@/components/ui/field";
import { deactivateEmployee, revealField, saveContact, updateBank, updateJob, updateStatutory } from "@/modules/employees/actions";
import type { AuditRow, Option, Profile } from "@/modules/employees/queries";
import type { FieldErrors } from "@/modules/employees/validation";

type Opts = { departments: Option[]; managers: (Option & { code: string })[]; states: { code: string; name: string }[] };
type Tab = "personal" | "job" | "statutory" | "bank" | "contact" | "audit";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5 font-medium">{children || "-"}</dd></div>;
}

export function ProfileView({ profile: p, options, audit, isHr, isSelf, aadhaarReady, justCreated }: {
  profile: Profile; options: Opts; audit: AuditRow[]; isHr: boolean; isSelf: boolean; aadhaarReady: boolean; justCreated: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("personal");
  const [busy, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(justCreated ? `Employee created with code ${justCreated}.` : null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [exit, setExit] = useState(false);
  const [lwd, setLwd] = useState("");
  const canEditContact = isSelf || isHr;
  const tabs: { key: Tab; label: string }[] = [{ key: "personal", label: "Personal" }, { key: "job", label: "Job" }, { key: "statutory", label: "Statutory" }, { key: "bank", label: "Bank" }, { key: "contact", label: "Contact and emergency" }, ...(isHr ? [{ key: "audit" as Tab, label: "History" }] : [])];

  // Local edit state per tab
  const [job, setJob] = useState({ designation: p.designation, salary_grade: p.salaryGrade ?? "", department_id: p.departmentId, reporting_manager_id: p.managerId ?? "", is_hr_admin: p.isHrAdmin });
  const [stat, setStat] = useState({ pan: "", uan: "", aadhaar: "" });
  const [bank, setBank] = useState({ account_number: "", ifsc: "", bank_name: p.bankName });
  const [c, setC] = useState({ mobile: p.contact.mobile, address_line1: p.contact.address1, address_line2: p.contact.address2, city: p.contact.city, state_code: p.contact.state, pin_code: p.contact.pin, ec_name: p.contact.ecName, ec_relationship: p.contact.ecRelationship, ec_mobile: p.contact.ecMobile });

  const run = (fn: () => Promise<{ ok: boolean; error?: string; fields?: FieldErrors }>, done: string) => {
    setError(null); setFields({}); setNotice(null);
    start(async () => {
      const r = await fn();
      if (r.ok) { setNotice(done); router.refresh(); } else { setError(r.error ?? "Could not save"); setFields(r.fields ?? {}); }
    });
  };
  const reveal = (field: "pan" | "bank_account") => start(async () => {
    const r = await revealField({ id: p.id, field });
    if (r.ok) { setRevealed((x) => ({ ...x, [field]: r.value })); setNotice("Revealed once and recorded in the history. Leaving this page hides it again."); router.refresh(); } else setError(r.error);
  });
  const text = (id: string, label: string, value: string, on: (v: string) => void, o: { type?: string; max?: number; hint?: string; upper?: boolean } = {}) => (
    <Field id={id} label={label} hint={o.hint} error={fields[id as keyof FieldErrors] ?? null}>
      <input id={id} type={o.type ?? "text"} className={inputCls} value={value} maxLength={o.max} onChange={(e) => on(o.upper ? e.target.value.toUpperCase() : e.target.value)} />
    </Field>
  );

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">{p.name} <span className="text-base font-normal text-muted">· {p.code}</span></h1>
        <p className="text-sm text-muted">{p.designation} · {p.department} · {p.location} {p.status !== "active" && <span className="ml-1 rounded-full bg-st-off-bg px-2 py-0.5 text-xs font-semibold text-st-off">Inactive</span>}</p>
      </div>
      {notice && <p role="status" className="mb-3 rounded-lg bg-st-present-bg p-3 text-sm text-st-present">{notice}</p>}
      {error && <p role="alert" className="mb-3 rounded-lg border border-danger p-3 text-sm text-danger">{error}</p>}

      <div role="tablist" aria-label="Profile sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setError(null); setNotice(null); setFields({}); }}
            className={clsx("shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium", tab === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-text")}>{t.label}</button>))}
      </div>

      <Card className="max-w-3xl"><CardBody>
        {tab === "personal" && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <Row label="Full name">{p.name}</Row><Row label="Employee code">{p.code}</Row><Row label="Email">{p.email}</Row><Row label="Gender">{p.gender}</Row>
            <Row label="Date of birth">{p.dob}</Row><Row label="Date of joining">{p.joined}</Row><Row label="Status">{p.status}{p.lastWorkingDay ? ` (last working day ${p.lastWorkingDay})` : ""}</Row>
          </dl>
        )}

        {tab === "job" && (isHr ? (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => updateJob({ id: p.id, ...job }), "Job details saved."); }}>
            {text("designation", "Designation", job.designation, (v) => setJob({ ...job, designation: v }))}
            {text("salary_grade", "Salary grade", job.salary_grade, (v) => setJob({ ...job, salary_grade: v }))}
            <Field id="department_id" label="Department"><select id="department_id" className={inputCls} value={job.department_id} onChange={(e) => setJob({ ...job, department_id: e.target.value })}>{options.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field id="reporting_manager_id" label="Reporting manager"><select id="reporting_manager_id" className={inputCls} value={job.reporting_manager_id} onChange={(e) => setJob({ ...job, reporting_manager_id: e.target.value })}>
              <option value="">No manager</option>{options.managers.filter((m) => m.id !== p.id).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}</select></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4" checked={job.is_hr_admin} onChange={(e) => setJob({ ...job, is_hr_admin: e.target.checked })} /> HR Admin</label>
            <div className="sm:col-span-2 flex flex-wrap gap-2"><Button type="submit" loading={busy}>Save job details</Button>
              {!isSelf && p.status === "active" && <Button type="button" variant="destructive" onClick={() => setExit(true)}>Deactivate (exit)</Button>}</div>
          </form>
        ) : (
          <><dl className="grid gap-4 sm:grid-cols-2"><Row label="Designation">{p.designation}</Row><Row label="Department">{p.department}</Row><Row label="Location">{p.location}</Row><Row label="Reporting manager">{p.manager}</Row><Row label="Salary grade">{p.salaryGrade}</Row></dl>
            <p className="mt-4 text-sm text-muted">Job details can only be changed by HR.</p></>
        ))}

        {tab === "statutory" && (
          <>
            <dl className="mb-4 grid gap-4 sm:grid-cols-2">
              <Row label="PAN">{revealed.pan ?? p.pan}{isHr && !revealed.pan && <button type="button" onClick={() => reveal("pan")} className="ml-2 inline-flex items-center gap-1 text-sm font-medium text-primary"><Eye className="size-4" aria-hidden /> Reveal</button>}</Row>
              <Row label="Aadhaar">{p.aadhaar}</Row><Row label="UAN (PF number)">{p.uan}</Row>
            </dl>
            <p className="mb-3 text-xs text-muted">Aadhaar is never shown in full, to anyone. {isHr ? "Revealing a PAN is recorded in the history." : ""}</p>
            {isHr && (
              <form className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => updateStatutory({ id: p.id, ...stat }), "Statutory details saved."); setStat({ pan: "", uan: "", aadhaar: "" }); }}>
                <p className="text-sm font-semibold sm:col-span-2">Change statutory details</p>
                {text("pan", "New PAN", stat.pan, (v) => setStat({ ...stat, pan: v }), { upper: true, max: 10, hint: "Like ABCDE1234F" })}
                {text("uan", "UAN", stat.uan, (v) => setStat({ ...stat, uan: v }), { max: 12 })}
                {text("aadhaar", "New Aadhaar (optional)", stat.aadhaar, (v) => setStat({ ...stat, aadhaar: v }), { max: 12, hint: aadhaarReady ? "Leave empty to keep the current one" : "Aadhaar storage isn't switched on yet" })}
                <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save</Button></div>
              </form>
            )}
          </>
        )}

        {tab === "bank" && (
          <>
            <dl className="mb-4 grid gap-4 sm:grid-cols-2">
              <Row label="Bank">{p.bankName}</Row><Row label="IFSC">{p.ifsc}</Row>
              <Row label="Account number">{revealed.bank_account ?? p.account}{isHr && !revealed.bank_account && <button type="button" onClick={() => reveal("bank_account")} className="ml-2 inline-flex items-center gap-1 text-sm font-medium text-primary"><Eye className="size-4" aria-hidden /> Reveal</button>}</Row>
            </dl>
            {isHr && (
              <form className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => updateBank({ id: p.id, ...bank }), "Bank details saved."); setBank({ ...bank, account_number: "" }); }}>
                <p className="text-sm font-semibold sm:col-span-2">Change bank details</p>
                {text("bank_name", "Bank name", bank.bank_name, (v) => setBank({ ...bank, bank_name: v }))}
                {text("account_number", "New account number", bank.account_number, (v) => setBank({ ...bank, account_number: v }), { max: 18, hint: "9 to 18 digits" })}
                {text("ifsc", "IFSC", bank.ifsc, (v) => setBank({ ...bank, ifsc: v }), { upper: true, max: 11, hint: "Like HDFC0001234" })}
                <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save</Button></div>
              </form>
            )}
          </>
        )}

        {tab === "contact" && (canEditContact ? (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => saveContact({ id: p.id, ...c }), "Contact details saved."); }}>
            {text("mobile", "Mobile", c.mobile, (v) => setC({ ...c, mobile: v }), { max: 10, hint: "10 digits starting with 6, 7, 8 or 9" })}{text("pin_code", "PIN code", c.pin_code, (v) => setC({ ...c, pin_code: v }), { max: 6 })}
            {text("address_line1", "Address line 1", c.address_line1, (v) => setC({ ...c, address_line1: v }))}{text("address_line2", "Address line 2", c.address_line2, (v) => setC({ ...c, address_line2: v }))}
            {text("city", "City", c.city, (v) => setC({ ...c, city: v }))}
            <Field id="state_code" label="State or UT"><select id="state_code" className={inputCls} value={c.state_code} onChange={(e) => setC({ ...c, state_code: e.target.value })}><option value="">Choose</option>{options.states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>
            <p className="text-sm font-semibold sm:col-span-2">Emergency contact</p>
            {text("ec_name", "Name", c.ec_name, (v) => setC({ ...c, ec_name: v }))}{text("ec_relationship", "Relationship", c.ec_relationship, (v) => setC({ ...c, ec_relationship: v }))}{text("ec_mobile", "Mobile", c.ec_mobile, (v) => setC({ ...c, ec_mobile: v }), { max: 10 })}
            <div className="sm:col-span-2"><Button type="submit" loading={busy}>Save contact details</Button></div>
          </form>
        ) : <p className="text-sm text-muted">Only the employee and HR can see contact details.</p>)}

        {tab === "audit" && isHr && (audit.length === 0 ? <p className="text-sm text-muted">No changes recorded yet.</p> : (
          <ul className="divide-y divide-border">
            {audit.map((a, i) => (
              <li key={i} className="py-3 text-sm"><p className="font-medium">{a.by} · {a.at}</p>
                <p className="text-muted">{a.action}{a.field ? ` · ${a.field}` : ""}{a.oldValue || a.newValue ? `: ${a.oldValue ?? "-"} → ${a.newValue ?? "-"}` : ""}{a.reason ? ` (${a.reason})` : ""}</p></li>))}
          </ul>
        ))}
      </CardBody></Card>

      {exit && (
        <ConfirmDialog title={`Deactivate ${p.name}?`} confirmLabel="Deactivate" cancelLabel="Keep active" onClose={() => setExit(false)}
          onConfirm={() => { if (!lwd) return; setExit(false); run(() => deactivateEmployee({ id: p.id, lastWorkingDay: lwd }), "Employee deactivated. They can no longer sign in after the last working day; the record is kept."); }}>
          <p className="mb-3">They can no longer sign in after the last working day. The record is never deleted.</p>
          <Field id="lwd" label="Last working day" required><input id="lwd" type="date" className={inputCls} value={lwd} min={p.joined} onChange={(e) => setLwd(e.target.value)} /></Field>
        </ConfirmDialog>
      )}
    </>
  );
}
