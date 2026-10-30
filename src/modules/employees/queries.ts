import "server-only";
import { requireEmployee } from "@/lib/auth";
import { q, withUser, type Row } from "@/lib/db/client";

// Reads for the Employee Master screens. Row-level security decides who sees what (HR everyone; others only themselves);
// PAN, Aadhaar and bank numbers are read ONLY through the masked views (CLAUDE.md rule 4).
export type EmployeeRow = { id: string; code: string; name: string; designation: string; department: string; location: string; status: string; manager: string | null; email: string };
export type Option = { id: string; name: string };
export type Profile = {
  id: string; code: string; name: string; email: string; dob: string; gender: string; joined: string; lastWorkingDay: string | null; status: string;
  designation: string; salaryGrade: string | null; department: string; departmentId: string; location: string; manager: string | null; managerId: string | null; isHrAdmin: boolean;
  contact: { mobile: string; address1: string; address2: string; city: string; state: string; pin: string; ecName: string; ecRelationship: string; ecMobile: string };
  pan: string; aadhaar: string; uan: string; account: string; ifsc: string; bankName: string;
};
export type AuditRow = { at: string; by: string; action: string; field: string | null; oldValue: string | null; newValue: string | null; reason: string | null };
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export async function listEmployees(f: { q?: string; status?: "active" | "inactive" | "all"; departmentId?: string; locationId?: string }): Promise<EmployeeRow[]> {
  const me = await requireEmployee();
  const term = `%${(f.q ?? "").trim()}%`;
  const [rows] = await withUser({ sub: me.sub }, [q`select e.id, e.employee_code, e.full_name, e.email::text as email, e.designation, d.name as department, l.name as location, e.status::text as status, m.full_name as manager
      from public.employees e join public.departments d on d.id = e.department_id join public.locations l on l.id = e.location_id
      left join public.employees m on m.id = e.reporting_manager_id
     where (${term}::text = '%%' or e.full_name ilike ${term}::text or e.employee_code ilike ${term}::text or e.email::text ilike ${term}::text)
       and (${f.status ?? "active"}::text = 'all' or e.status::text = ${f.status ?? "active"}::text)
       and (${f.departmentId ?? ""}::text = '' or e.department_id::text = ${f.departmentId ?? ""}::text)
       and (${f.locationId ?? ""}::text = '' or e.location_id::text = ${f.locationId ?? ""}::text)
     order by e.employee_code limit 300`]);
  return rows.map((r) => ({ id: s(r.id), code: s(r.employee_code), name: s(r.full_name), email: s(r.email), designation: s(r.designation), department: s(r.department), location: s(r.location), status: s(r.status), manager: r.manager ? s(r.manager) : null }));
}

export async function getFormOptions(): Promise<{ departments: Option[]; locations: Option[]; managers: (Option & { code: string })[]; states: { code: string; name: string }[] }> {
  const me = await requireEmployee();
  const [d, l, m, st] = await withUser({ sub: me.sub }, [
    q`select id, name from public.departments where is_active order by name`,
    q`select id, name from public.locations where is_active order by name`,
    q`select id, full_name as name, employee_code as code from public.employees where status = 'active' order by full_name`,
    q`select code, name from public.indian_states order by name`,
  ]);
  const o = (r: Row) => ({ id: s(r.id), name: s(r.name) });
  return { departments: d.map(o), locations: l.map(o), managers: m.map((r) => ({ ...o(r), code: s(r.code) })), states: st.map((r) => ({ code: s(r.code), name: s(r.name) })) };
}

/** A profile for yourself or (HR) anyone. Returns null when row-level security shows nothing, so a guessed id looks like a missing page. */
export async function getProfile(id: string): Promise<Profile | null> {
  const me = await requireEmployee();
  const [emp, contact, stat, bank] = await withUser({ sub: me.sub }, [
    q`select e.id, e.employee_code, e.full_name, e.email::text as email, e.dob::text as dob, e.gender::text as gender, e.date_of_joining::text as joined, e.last_working_day::text as lwd,
             e.status::text as status, e.designation, e.salary_grade, e.is_hr_admin, d.id as department_id, d.name as department, l.name as location, e.reporting_manager_id,
             (select m.full_name from public.employees m where m.id = e.reporting_manager_id) as manager
        from public.employees e join public.departments d on d.id = e.department_id join public.locations l on l.id = e.location_id where e.id = ${id}::uuid`,
    q`select c.mobile, c.address_line1, c.address_line2, c.city, c.state_code, c.pin_code, c.ec_name, c.ec_relationship, c.ec_mobile from public.employee_contact c where c.employee_id = ${id}::uuid`,
    q`select pan_masked, aadhaar_masked, uan from public.v_statutory_masked where employee_id = ${id}::uuid`,
    q`select account_masked, ifsc, bank_name from public.v_bank_masked where employee_id = ${id}::uuid`,
  ]);
  const e = emp[0];
  if (!e) return null;
  const c = contact[0] ?? {}, st = stat[0] ?? {}, b = bank[0] ?? {};
  // A person cannot read their own manager's row (RLS), so for yourself the manager's name comes from whoami().
  let manager = e.manager ? s(e.manager) : null;
  if (!manager && e.reporting_manager_id && id === me.id) manager = me.managerName;
  return {
    id: s(e.id), code: s(e.employee_code), name: s(e.full_name), email: s(e.email), dob: s(e.dob), gender: s(e.gender), joined: s(e.joined), lastWorkingDay: e.lwd ? s(e.lwd) : null,
    status: s(e.status), designation: s(e.designation), salaryGrade: e.salary_grade ? s(e.salary_grade) : null, department: s(e.department), departmentId: s(e.department_id),
    location: s(e.location), manager, managerId: e.reporting_manager_id ? s(e.reporting_manager_id) : null, isHrAdmin: Boolean(e.is_hr_admin),
    contact: { mobile: s(c.mobile), address1: s(c.address_line1), address2: s(c.address_line2), city: s(c.city), state: s(c.state_code), pin: s(c.pin_code), ecName: s(c.ec_name), ecRelationship: s(c.ec_relationship), ecMobile: s(c.ec_mobile) },
    pan: s(st.pan_masked), aadhaar: s(st.aadhaar_masked), uan: s(st.uan), account: s(b.account_masked), ifsc: s(b.ifsc), bankName: s(b.bank_name),
  };
}

/** Who changed what, old and new value, when (E8). HR only (the audit table is HR-readable). */
export async function getAudit(id: string): Promise<AuditRow[]> {
  const me = await requireEmployee();
  const [rows] = await withUser({ sub: me.sub }, [q`select to_char(a.changed_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI am') as at, coalesce(w.full_name, 'System') as by, a.action::text as action, a.field, a.old_value, a.new_value, a.reason
      from public.audit_log a left join public.employees w on w.id = a.changed_by where a.record_id = ${id}::uuid order by a.changed_at desc, a.id desc limit 100`]);
  return rows.map((r) => ({ at: s(r.at), by: s(r.by), action: s(r.action), field: r.field ? s(r.field) : null, oldValue: r.old_value ? s(r.old_value) : null, newValue: r.new_value ? s(r.new_value) : null, reason: r.reason ? s(r.reason) : null }));
}
