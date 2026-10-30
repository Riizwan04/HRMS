-- Samudra demo data: run ONCE in the Neon SQL Editor (as the owner role) after the earlier setup scripts.
-- Adds 17 people (with your 3 test logins that makes 20: 1 HR Admin, 3 managers), 4 departments, a 2026 holiday calendar for both sites
-- (sample dates: HR should replace them from the official Goa notification), some EL carried-forward balances and ~3 weeks of attendance.
-- The people use @kcf.example addresses (a reserved, non-routable domain), so nobody can sign in as them; your three test logins are untouched.
-- Fake PAN, bank and Aadhaar values are generated; Aadhaar is stored encrypted by the database (pgcrypto) and never shown.
-- Safe to re-run: every insert skips rows that already exist.

insert into public.departments(name) select v from (values ('Operations'), ('Human Resources'), ('Finance'), ('Production')) d(v)
 where not exists (select 1 from public.departments x where x.name = d.v);

create schema if not exists kinara_meta;
drop table if exists kinara_meta._seed_people;
create table kinara_meta._seed_people(n int, name text, gender text, dob date, doj date, designation text, grade text, loc text, dept text, mgr text, email text);
insert into kinara_meta._seed_people values
  (1, 'Suresh Gaonkar', 'male', date '1983-04-17', date '2018-06-01', 'Finance Manager', 'G6', 'P', 'Finance', 'riizhr+clerk_test@gmail.com', 'suresh.gaonkar@kcf.example'),
  (2, 'Meena Fernandes', 'female', date '1985-09-02', date '2017-02-13', 'Plant Manager', 'G6', 'V', 'Production', 'riizhr+clerk_test@gmail.com', 'meena.fernandes@kcf.example'),
  (3, 'Priya Naik', 'female', date '1992-01-23', date '2021-08-02', 'HR Executive', 'G3', 'P', 'Human Resources', 'riizhr+clerk_test@gmail.com', 'priya.naik@kcf.example'),
  (4, 'Rohan Kamat', 'male', date '1994-11-09', date '2022-03-14', 'Operations Executive', 'G3', 'P', 'Operations', 'riizmgr+clerk_test@gmail.com', 'rohan.kamat@kcf.example'),
  (5, 'Anita Desai', 'female', date '1990-07-30', date '2019-10-07', 'Senior Executive', 'G4', 'P', 'Operations', 'riizmgr+clerk_test@gmail.com', 'anita.desai@kcf.example'),
  (6, 'Vikram Shet', 'male', date '1996-02-14', date '2025-01-20', 'Operations Trainee', 'G2', 'P', 'Operations', 'riizmgr+clerk_test@gmail.com', 'vikram.shet@kcf.example'),
  (7, 'Neha Prabhu', 'female', date '1991-05-05', date '2020-09-21', 'Accounts Executive', 'G3', 'P', 'Finance', 'suresh.gaonkar@kcf.example', 'neha.prabhu@kcf.example'),
  (8, 'Amit Borkar', 'male', date '1988-12-12', date '2019-04-01', 'Senior Accountant', 'G4', 'P', 'Finance', 'suresh.gaonkar@kcf.example', 'amit.borkar@kcf.example'),
  (9, 'Sneha Kudalkar', 'female', date '1995-08-19', date '2023-06-12', 'Accounts Assistant', 'G2', 'P', 'Finance', 'suresh.gaonkar@kcf.example', 'sneha.kudalkar@kcf.example'),
  (10, 'Dinesh Parab', 'male', date '1993-03-27', date '2022-11-14', 'Billing Executive', 'G3', 'P', 'Finance', 'suresh.gaonkar@kcf.example', 'dinesh.parab@kcf.example'),
  (11, 'Joseph D''Souza', 'male', date '1987-06-06', date '2016-07-18', 'Production Supervisor', 'G5', 'V', 'Production', 'meena.fernandes@kcf.example', 'joseph.dsouza@kcf.example'),
  (12, 'Maria Pereira', 'female', date '1989-10-21', date '2018-01-08', 'Quality Inspector', 'G4', 'V', 'Production', 'meena.fernandes@kcf.example', 'maria.pereira@kcf.example'),
  (13, 'Ganesh Naik', 'male', date '1991-02-02', date '2020-05-04', 'Machine Operator', 'G2', 'V', 'Production', 'meena.fernandes@kcf.example', 'ganesh.naik@kcf.example'),
  (14, 'Sunita Velip', 'female', date '1994-09-15', date '2021-02-15', 'Packing Operator', 'G2', 'V', 'Production', 'meena.fernandes@kcf.example', 'sunita.velip@kcf.example'),
  (15, 'Rajesh Gawas', 'male', date '1990-04-04', date '2019-09-02', 'Machine Operator', 'G2', 'V', 'Production', 'meena.fernandes@kcf.example', 'rajesh.gawas@kcf.example'),
  (16, 'Kavita Salgaonkar', 'female', date '1997-01-11', date '2026-07-01', 'Packing Operator', 'G2', 'V', 'Production', 'meena.fernandes@kcf.example', 'kavita.salgaonkar@kcf.example'),
  (17, 'Arjun Mandrekar', 'male', date '1998-06-28', date '2024-03-11', 'Store Keeper', 'G2', 'V', 'Production', 'meena.fernandes@kcf.example', 'arjun.mandrekar@kcf.example');

-- employees (managers first so reporting lines resolve; the employee code KCF#### is generated automatically)
insert into public.employees(full_name, email, dob, gender, date_of_joining, designation, salary_grade, location_id, department_id, reporting_manager_id, is_hr_admin)
select p.name, p.email, p.dob, p.gender::public.gender_t, p.doj, p.designation, p.grade,
       (select id from public.locations where name like case p.loc when 'P' then 'Panaji%' else 'Verna%' end limit 1),
       (select id from public.departments where name = p.dept),
       (select e.id from public.employees e where e.email = p.mgr::citext), false
from kinara_meta._seed_people p
where p.n <= 2 and not exists (select 1 from public.employees x where x.email = p.email::citext)
order by p.n;
insert into public.employees(full_name, email, dob, gender, date_of_joining, designation, salary_grade, location_id, department_id, reporting_manager_id, is_hr_admin)
select p.name, p.email, p.dob, p.gender::public.gender_t, p.doj, p.designation, p.grade,
       (select id from public.locations where name like case p.loc when 'P' then 'Panaji%' else 'Verna%' end limit 1),
       (select id from public.departments where name = p.dept),
       (select e.id from public.employees e where e.email = p.mgr::citext), false
from kinara_meta._seed_people p
where p.n > 2 and not exists (select 1 from public.employees x where x.email = p.email::citext)
order by p.n;

-- contact, statutory (fake) and bank (fake) details
insert into public.employee_contact(employee_id, mobile, address_line1, city, state_code, pin_code, ec_name, ec_relationship, ec_mobile)
select e.id, '98' || lpad((10000000 + p.n * 7919)::text, 8, '0'), 'House ' || (10 + p.n) || ', Main Road', case p.loc when 'P' then 'Panaji' else 'Verna' end, 'GA',
       case p.loc when 'P' then '403001' else '403722' end, 'Family contact ' || p.n, 'Spouse', '97' || lpad((20000000 + p.n * 6101)::text, 8, '0')
from kinara_meta._seed_people p join public.employees e on e.email = p.email::citext
where not exists (select 1 from public.employee_contact c where c.employee_id = e.id);
insert into public.employee_statutory(employee_id, pan, uan, aadhaar_ciphertext, aadhaar_last4)
select e.id, 'KCFSD' || lpad((1000 + p.n)::text, 4, '0') || 'P', '1001' || lpad((20000000 + p.n)::text, 8, '0'),
       pgp_sym_encrypt('9999' || lpad((10000000 + p.n)::text, 8, '0'), 'seed-data-only-key')::bytea, right('9999' || lpad((10000000 + p.n)::text, 8, '0'), 4)
from kinara_meta._seed_people p join public.employees e on e.email = p.email::citext
where not exists (select 1 from public.employee_statutory s where s.employee_id = e.id);
insert into public.employee_bank(employee_id, account_number, ifsc, bank_name)
select e.id, '5500' || lpad((10000000 + p.n * 31)::text, 8, '0'), 'HDFC0001234', 'HDFC Bank'
from kinara_meta._seed_people p join public.employees e on e.email = p.email::citext
where not exists (select 1 from public.employee_bank b where b.employee_id = e.id);

-- Earned Leave carried forward into 2026 for the longer-serving people
insert into public.leave_opening_balances(employee_id, leave_type_id, year, days)
select e.id, (select id from public.leave_types where code = 'EL'), 2026, v.days
from (values ('joseph.dsouza@kcf.example', 12.5), ('meena.fernandes@kcf.example', 18.0), ('suresh.gaonkar@kcf.example', 9.0), ('amit.borkar@kcf.example', 6.5), ('maria.pereira@kcf.example', 4.0)) v(email, days)
join public.employees e on e.email = v.email::citext
on conflict do nothing;

-- Holidays 2026 for both sites (SAMPLE dates; replace from the official Goa notification)
insert into public.holidays(location_id, holiday_date, name, type)
select l.id, h.d, h.name, h.type::public.holiday_type_t
from public.locations l cross join (values
  (date '2026-01-26', 'Republic Day', 'national'), (date '2026-04-03', 'Good Friday', 'state'), (date '2026-05-01', 'Labour Day', 'state'),
  (date '2026-05-30', 'Goa Statehood Day', 'state'), (date '2026-08-15', 'Independence Day', 'national'), (date '2026-09-14', 'Ganesh Chaturthi', 'state'),
  (date '2026-10-02', 'Gandhi Jayanti', 'national'), (date '2026-10-20', 'Dussehra', 'state'), (date '2026-11-08', 'Diwali', 'state'),
  (date '2026-12-19', 'Goa Liberation Day', 'state'), (date '2026-12-25', 'Christmas', 'state'),
  (date '2026-02-15', 'Maha Shivaratri', 'optional'), (date '2026-08-28', 'Raksha Bandhan', 'optional'), (date '2026-09-04', 'Janmashtami', 'optional'),
  (date '2026-11-24', 'Guru Nanak Jayanti', 'optional')) h(d, name, type)
where l.is_active
on conflict (location_id, holiday_date) do nothing;

-- About three weeks of attendance for the demo people (not your three test logins): mostly Present, a few Late, a few half days.
-- Weekly offs and holidays are skipped using the same database rule the app uses.
insert into public.attendance(employee_id, work_date, check_in, check_out)
select e.id, d.day,
       ((d.day::timestamp + case when h % 11 = 0 then interval '10 hours 40 minutes' else interval '9 hours' + (h % 40) * interval '1 minute' end) at time zone 'Asia/Kolkata'),
       ((d.day::timestamp + case when h % 13 = 0 then interval '13 hours 10 minutes' else interval '18 hours' + (h % 25) * interval '1 minute' end) at time zone 'Asia/Kolkata')
from kinara_meta._seed_people p
join public.employees e on e.email = p.email::citext
cross join lateral (select g::date as day from generate_series((now() at time zone 'Asia/Kolkata')::date - 24, (now() at time zone 'Asia/Kolkata')::date - 1, interval '1 day') g) d
cross join lateral (select abs(hashtext(e.id::text || d.day::text)) as h) hh(h)
where d.day >= e.date_of_joining
  and h % 17 <> 0                                      -- a few days with no punch (Absent)
  and not exists (select 1 from public.attendance a where a.employee_id = e.id and a.work_date = d.day)
  and (select o.reason from private.off_day(e.id, d.day) o) is null
  and exists (select 1 where true);

drop table kinara_meta._seed_people;

select (select count(*) from public.employees where status = 'active') as employees,
       (select count(*) from public.employees where is_hr_admin) as hr_admins,
       (select count(distinct reporting_manager_id) from public.employees where reporting_manager_id is not null) as managers,
       (select count(*) from public.departments where is_active) as departments,
       (select count(*) from public.holidays) as holidays,
       (select count(*) from public.attendance) as attendance_rows;
