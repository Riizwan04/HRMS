"use server";

import { requireEmployee } from "@/lib/auth";
import { aadhaarKeyConfigured, encryptAadhaar } from "@/lib/crypto";
import { q, withUser } from "@/lib/db/client";
import { type EmployeeForm, validateContact, validateEmployee, type FieldErrors } from "./validation";

// Writes for the Employee Master. The acting person comes from the session; the database refuses anything HR-only for others.
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; fields?: FieldErrors };

const MESSAGES: Record<string, string> = {
  forbidden: "Only HR can do that",
  manager_cycle: "That reporting line would create a loop (someone would report to themselves)",
  manager_inactive: "The reporting manager must be an active employee",
  last_hr_admin: "There must always be at least one HR Admin",
  has_active_reports: "This person still has active reports. Move them to another manager first",
  cannot_deactivate_self: "You can't deactivate yourself",
  not_found: "That employee no longer exists",
  invalid_field: "That field can't be revealed",
  employee_code_immutable: "The employee code can never change",
};
function fail(e: unknown): { ok: false; error: string } {
  const m = (e as Error).message.trim();
  if (MESSAGES[m]) return { ok: false, error: MESSAGES[m] };
  if (/employees_email_key|duplicate key.*email/i.test(m)) return { ok: false, error: "An employee with this email already exists" };
  if (/chk_age_18/.test(m)) return { ok: false, error: "The employee must be at least 18 on the joining date" };
  if (/violates check constraint/.test(m)) return { ok: false, error: "One of the values is not in the right format. Please check the highlighted fields" };
  return { ok: false, error: "Something went wrong. Please try again." };
}
const j = (o: Record<string, unknown>) => JSON.stringify(o);

export async function createEmployee(f: EmployeeForm): Promise<Result<{ id: string; code: string }>> {
  const me = await requireEmployee();
  const fields = validateEmployee(f);
  if (Object.keys(fields).length) return { ok: false, error: "Please fix the highlighted fields", fields };
  if (!aadhaarKeyConfigured()) return { ok: false, error: "Aadhaar storage is not switched on yet (the encryption key is missing on the server)" };
  try {
    const { ct, last4 } = encryptAadhaar(f.aadhaar);
    const payload = { ...f, aadhaar: undefined, aadhaar_ct: ct, aadhaar_last4: last4 };
    const [[row]] = await withUser({ sub: me.sub }, [q`select public.hr_create_employee(${j(payload)}::jsonb) as r`]);
    const r = row.r as { id: string; employee_code: string };
    return { ok: true, id: r.id, code: r.employee_code };
  } catch (e) { return fail(e); }
}

/** Self-service: your own phone, address and emergency contact (E5). HR may edit anyone's. */
export async function saveContact(i: { id: string; mobile: string; address_line1: string; address_line2: string; city: string; state_code: string; pin_code: string; ec_name: string; ec_relationship: string; ec_mobile: string }): Promise<Result> {
  const me = await requireEmployee();
  const fields = validateContact(i);
  if (Object.keys(fields).length) return { ok: false, error: "Please fix the highlighted fields", fields };
  try {
    const { id, ...rest } = i;
    await withUser({ sub: me.sub }, [q`select public.update_contact(${id}::uuid, ${j(rest)}::jsonb)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateJob(i: { id: string; designation: string; salary_grade: string; department_id: string; reporting_manager_id: string; is_hr_admin: boolean }): Promise<Result> {
  const me = await requireEmployee();
  if (!i.designation.trim()) return { ok: false, error: "Enter the designation", fields: { designation: "Enter the designation" } };
  try {
    const { id, ...rest } = i;
    await withUser({ sub: me.sub }, [q`select public.hr_update_employee(${id}::uuid, ${j(rest)}::jsonb)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateStatutory(i: { id: string; pan: string; uan: string; aadhaar: string }): Promise<Result> {
  const me = await requireEmployee();
  const fields: FieldErrors = {};
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(i.pan)) fields.pan = "PAN must be 5 letters, 4 digits, 1 letter (like ABCDE1234F)";
  if (i.uan && !/^[0-9]{12}$/.test(i.uan)) fields.uan = "UAN must be 12 digits";
  if (i.aadhaar && !/^[0-9]{12}$/.test(i.aadhaar)) fields.aadhaar = "Aadhaar must be 12 digits";
  if (Object.keys(fields).length) return { ok: false, error: "Please fix the highlighted fields", fields };
  if (i.aadhaar && !aadhaarKeyConfigured()) return { ok: false, error: "Aadhaar storage is not switched on yet (the encryption key is missing on the server)" };
  try {
    const p: Record<string, unknown> = { pan: i.pan, uan: i.uan };
    if (i.aadhaar) { const { ct, last4 } = encryptAadhaar(i.aadhaar); p.aadhaar_ct = ct; p.aadhaar_last4 = last4; }
    await withUser({ sub: me.sub }, [q`select public.hr_update_statutory(${i.id}::uuid, ${j(p)}::jsonb)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateBank(i: { id: string; account_number: string; ifsc: string; bank_name: string }): Promise<Result> {
  const me = await requireEmployee();
  const fields: FieldErrors = {};
  if (!/^[0-9]{9,18}$/.test(i.account_number)) fields.account_number = "Account number must be 9 to 18 digits";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(i.ifsc)) fields.ifsc = "IFSC must be 4 letters, then 0, then 6 letters or digits";
  if (!i.bank_name.trim()) fields.bank_name = "Enter the bank name";
  if (Object.keys(fields).length) return { ok: false, error: "Please fix the highlighted fields", fields };
  try {
    const { id, ...rest } = i;
    await withUser({ sub: me.sub }, [q`select public.hr_update_bank(${id}::uuid, ${j(rest)}::jsonb)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Exit: HR sets the last working day; the person can no longer sign in after it and the record is kept forever (E6). */
export async function deactivateEmployee(i: { id: string; lastWorkingDay: string }): Promise<Result> {
  const me = await requireEmployee();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.lastWorkingDay)) return { ok: false, error: "Choose the last working day" };
  try {
    await withUser({ sub: me.sub }, [q`select public.deactivate_employee(${i.id}::uuid, ${i.lastWorkingDay}::date)`]);
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** HR clicks Reveal: the plain PAN or bank number is returned once and the reveal is written to the audit log. Aadhaar can never be revealed. */
export async function revealField(i: { id: string; field: "pan" | "bank_account" }): Promise<Result<{ value: string }>> {
  const me = await requireEmployee();
  try {
    const [[row]] = await withUser({ sub: me.sub }, [q`select public.reveal_statutory(${i.id}::uuid, ${i.field}::text) as v`]);
    return { ok: true, value: String(row.v) };
  } catch (e) { return fail(e); }
}
