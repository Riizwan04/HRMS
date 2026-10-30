"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, inputCls } from "@/components/ui/field";
import { createEmployee } from "@/modules/employees/actions";
import type { Option } from "@/modules/employees/queries";
import { validateEmployee, type EmployeeForm, type FieldErrors } from "@/modules/employees/validation";

type Opts = { departments: Option[]; locations: Option[]; managers: (Option & { code: string })[]; states: { code: string; name: string }[] };
const EMPTY: EmployeeForm = {
  full_name: "", email: "", dob: "", gender: "", date_of_joining: "", designation: "", salary_grade: "", location_id: "", department_id: "", reporting_manager_id: "", is_hr_admin: false,
  mobile: "", address_line1: "", address_line2: "", city: "", state_code: "", pin_code: "", ec_name: "", ec_relationship: "", ec_mobile: "",
  pan: "", aadhaar: "", uan: "", account_number: "", ifsc: "", bank_name: "",
};
const STEPS = ["Personal and job", "Contact", "Statutory and bank"] as const;
const STEP_FIELDS: (keyof EmployeeForm)[][] = [
  ["full_name", "email", "dob", "gender", "date_of_joining", "designation", "location_id", "department_id"],
  ["mobile", "pin_code", "ec_mobile"], ["pan", "aadhaar", "uan", "account_number", "ifsc", "bank_name"],
];

// Multi-step form with validation on every Indian field (brief screen "Add / edit employee"). The database re-checks everything.
export function NewEmployeeForm({ options, aadhaarReady }: { options: Opts; aadhaarReady: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<EmployeeForm>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = <K extends keyof EmployeeForm>(k: K, v: EmployeeForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const err = (k: keyof EmployeeForm) => errors[k] ?? null;
  const inp = (k: keyof EmployeeForm, label: string, o: { type?: string; required?: boolean; hint?: string; upper?: boolean; max?: number } = {}) => (
    <Field id={k} label={label} required={o.required} hint={o.hint} error={err(k)}>
      <input id={k} type={o.type ?? "text"} className={inputCls} value={String(f[k])} maxLength={o.max} aria-invalid={!!err(k)}
        onChange={(e) => set(k, (o.upper ? e.target.value.toUpperCase() : e.target.value) as never)} />
    </Field>
  );
  const sel = (k: keyof EmployeeForm, label: string, items: { value: string; label: string }[], required = false, blank = "Choose") => (
    <Field id={k} label={label} required={required} error={err(k)}>
      <select id={k} className={inputCls} value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} aria-invalid={!!err(k)}>
        <option value="">{blank}</option>{items.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
      </select>
    </Field>
  );

  const next = () => {
    const all = validateEmployee(f, { requireAadhaar: step === 2 });
    const mine = Object.fromEntries(STEP_FIELDS[step].filter((k) => all[k]).map((k) => [k, all[k]])) as FieldErrors;
    setErrors(mine);
    if (Object.keys(mine).length === 0) setStep(step + 1);
  };
  const submit = () => {
    const all = validateEmployee(f);
    setErrors(all);
    if (Object.keys(all).length) { const first = STEP_FIELDS.findIndex((s) => s.some((k) => all[k])); if (first >= 0) setStep(first); return; }
    setFormError(null);
    start(async () => {
      const r = await createEmployee(f);
      if (r.ok) { router.push(`/employees/${r.id}?created=${r.code}`); return; }
      setFormError(r.error);
      if (r.fields) setErrors(r.fields);
    });
  };

  return (
    <Card className="max-w-3xl">
      <CardBody className="flex flex-col gap-5">
        <ol className="flex gap-2 text-sm" aria-label="Steps">
          {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={i === step ? "rounded-full bg-primary px-3 py-1 font-semibold text-on-primary" : "rounded-full border border-border px-3 py-1 text-muted"}>{i + 1}. {s}</li>)}
        </ol>

        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {inp("full_name", "Full name", { required: true })}{inp("email", "Work email", { required: true, type: "email", hint: "Used to sign in. Must match the email they sign up with." })}
            {inp("dob", "Date of birth", { required: true, type: "date" })}
            {sel("gender", "Gender", [{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }], true)}
            {inp("date_of_joining", "Date of joining", { required: true, type: "date" })}{inp("designation", "Designation", { required: true })}
            {sel("location_id", "Location", options.locations.map((l) => ({ value: l.id, label: l.name })), true)}
            {sel("department_id", "Department", options.departments.map((d) => ({ value: d.id, label: d.name })), true)}
            {sel("reporting_manager_id", "Reporting manager", options.managers.map((m) => ({ value: m.id, label: `${m.name} (${m.code})` })), false, "No manager")}
            {inp("salary_grade", "Salary grade", { hint: "Optional" })}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="size-4" checked={f.is_hr_admin} onChange={(e) => set("is_hr_admin", e.target.checked)} /> Make this person an HR Admin</label>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {inp("mobile", "Mobile", { required: true, max: 10, hint: "10 digits starting with 6, 7, 8 or 9" })}{inp("pin_code", "PIN code", { max: 6 })}
            {inp("address_line1", "Address line 1")}{inp("address_line2", "Address line 2")}{inp("city", "City")}
            {sel("state_code", "State or UT", options.states.map((s) => ({ value: s.code, label: s.name })))}
            <p className="text-sm font-semibold sm:col-span-2">Emergency contact</p>
            {inp("ec_name", "Name")}{inp("ec_relationship", "Relationship")}{inp("ec_mobile", "Mobile", { max: 10 })}
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {inp("pan", "PAN", { required: true, upper: true, max: 10, hint: "Like ABCDE1234F" })}
            {inp("aadhaar", "Aadhaar", { required: true, max: 12, hint: aadhaarReady ? "12 digits. Stored encrypted and never shown in full again." : "Aadhaar storage isn't switched on yet (server key missing)." })}
            {inp("uan", "UAN (PF number)", { max: 12, hint: "Optional for new joiners" })}
            {inp("bank_name", "Bank name", { required: true })}{inp("account_number", "Account number", { required: true, max: 18 })}{inp("ifsc", "IFSC", { required: true, upper: true, max: 11, hint: "Like HDFC0001234" })}
          </div>
        )}

        {formError && <p role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">{formError}</p>}
        <div className="flex justify-between gap-2">
          <Button variant="secondary" onClick={() => (step === 0 ? router.push("/employees") : setStep(step - 1))}>{step === 0 ? "Cancel" : "Back"}</Button>
          {step < 2 ? <Button onClick={next}>Next</Button> : <Button onClick={submit} loading={busy}>Create employee</Button>}
        </div>
      </CardBody>
    </Card>
  );
}
