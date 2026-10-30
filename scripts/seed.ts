// Seeds reference data and THREE test people (HR Admin, Manager, Employee) from emails given in the environment,
// so real sign-ins can be linked by email on first login. Idempotent.  npm run db:seed
//   SEED_HR_EMAIL, SEED_MANAGER_EMAIL, SEED_EMPLOYEE_EMAIL  (the verified Clerk emails of your test accounts)
import { withAdmin } from "../src/lib/db/admin";

const need = (k: string) => { const v = process.env[k]?.trim().toLowerCase(); if (!v) throw new Error(`${k} is not set`); return v; };

withAdmin(async (c) => {
  const hr = need("SEED_HR_EMAIL"), mgr = need("SEED_MANAGER_EMAIL"), emp = need("SEED_EMPLOYEE_EMAIL");
  if (new Set([hr, mgr, emp]).size !== 3) throw new Error("The three emails must be different");

  await c.query("insert into public.departments(name) select 'Operations' where not exists (select 1 from public.departments where name = 'Operations')");
  for (const [name, city] of [["Panaji Head Office", "Panaji"], ["Verna Plant", "Verna"]]) {
    await c.query("insert into public.locations(name, city, state_code) select $1, $2, 'GA' where not exists (select 1 from public.locations where name = $1)", [name, city]);
  }
  await c.query(`insert into public.location_weekly_offs(location_id, effective_from, weekly_off_days)
    select l.id, date '2000-01-01', case when l.name like 'Panaji%' then array[6,7]::smallint[] else array[7]::smallint[] end
    from public.locations l where not exists (select 1 from public.location_weekly_offs w where w.location_id = l.id)`);

  const person = async (email: string, name: string, gender: string, designation: string, isHr: boolean, managerEmail: string | null) => {
    const r = await c.query(
      `insert into public.employees(full_name, email, dob, gender, date_of_joining, designation, location_id, department_id, reporting_manager_id, is_hr_admin)
       select $2, $1, date '1990-01-01', $3::public.gender_t, date '2025-01-06', $4,
              (select id from public.locations where name like 'Panaji%'), (select id from public.departments where name = 'Operations'),
              (select id from public.employees where email = $5::citext), $6
       where not exists (select 1 from public.employees where email = $1::citext)
       returning id`, [email, name, gender, designation, managerEmail, isHr]);
    if (r.rows[0]) await c.query("insert into public.employee_contact(employee_id, mobile) values ($1, '9000000000')", [r.rows[0].id]);
    console.log(`${r.rows[0] ? "created" : "exists "} ${email}`);
  };
  await person(hr, "HR Admin (test)", "female", "HR Manager", true, null);
  await person(mgr, "Manager (test)", "male", "Operations Manager", false, hr);
  await person(emp, "Employee (test)", "female", "Executive", false, mgr);
}).catch((e) => { console.error(e.message); process.exit(1); });
