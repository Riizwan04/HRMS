-- Shared fixtures for pgTAP tests. Included with \i inside each test's transaction (everything rolls back).
-- Clock: Fri 16 Oct 2026, 12:00 IST. People: hr (root HR admin), mgr (Panaji manager), mgr2 (Verna manager),
-- emp1 (F) and emp2 (M) and joiner (M, joined 1 Jul 2026) at Panaji under mgr, plant1 (M) at Verna under mgr2.
create schema tests;
create table tests.ids (name text primary key, id uuid not null);
create function tests.id(n text) returns uuid language sql stable as $$ select id from tests.ids where name = n $$;
create function tests.lt(c text) returns uuid language sql stable as $$ select id from public.leave_types where code = c $$;
create function tests.at(ts text) returns void language plpgsql as $$
begin perform set_config('app.test_now', ts, true); end $$;
create function tests.login(s text) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', s)::text, true);
  set local role authenticated;
end $$;
create function tests.logout() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claims', '', true); end $$;
grant usage on schema tests to public;
grant select on tests.ids to public;
grant execute on all functions in schema tests to public;

select tests.at('2026-10-16 12:00:00+05:30');

insert into public.departments(name) values ('Operations');
insert into public.locations(name, city, state_code) values ('Panaji Head Office', 'Panaji', 'GA'), ('Verna Plant', 'Verna', 'GA');
insert into public.location_weekly_offs
  select id, date '2000-01-01', case when name like 'Panaji%' then array[6,7]::smallint[] else array[7]::smallint[] end from public.locations;

insert into tests.ids values
  ('ho', (select id from public.locations where name like 'Panaji%')),
  ('plant', (select id from public.locations where name like 'Verna%')),
  ('dept', (select id from public.departments limit 1));

create function tests.mk(code text, sub text, nm text, g text, doj date, loc text, mgr text, hr boolean default false) returns void
language plpgsql as $$
declare new_id uuid;
begin
  insert into public.employees(clerk_user_id, full_name, email, dob, gender, date_of_joining, designation, location_id, department_id,
                               reporting_manager_id, is_hr_admin)
  values (sub, nm, sub || '@example.in', '1990-03-04', g::public.gender_t, doj, 'Staff', tests.id(loc), tests.id('dept'),
          case when mgr is null then null else tests.id(mgr) end, hr)
  returning id into new_id;
  insert into tests.ids values (code, new_id);
  insert into public.employee_contact(employee_id, mobile) values (new_id, '9876543210');
end $$;

select tests.mk('hr', 'u_hr', 'Hema HR', 'female', '2020-01-01', 'ho', null, true);
select tests.mk('mgr', 'u_mgr', 'Mohan Manager', 'male', '2020-01-01', 'ho', 'hr');
select tests.mk('mgr2', 'u_mgr2', 'Meena Plant Manager', 'female', '2020-01-01', 'plant', 'hr');
select tests.mk('emp1', 'u_emp1', 'Asha Naik', 'female', '2025-01-06', 'ho', 'mgr');
select tests.mk('emp2', 'u_emp2', 'Ravi Kamat', 'male', '2025-01-06', 'ho', 'mgr');
select tests.mk('joiner', 'u_joiner', 'Joy Joiner', 'male', '2026-07-01', 'ho', 'mgr');
select tests.mk('plant1', 'u_plant1', 'Pavan Fal', 'male', '2025-01-06', 'plant', 'mgr2');

insert into public.employee_statutory(employee_id, pan, uan, aadhaar_ciphertext, aadhaar_last4)
  select tests.id(c), 'ABCDE1234F', '100123456789', '\x0102'::bytea, '1234' from (values ('emp1'), ('emp2')) v(c);
insert into public.employee_bank(employee_id, account_number, ifsc, bank_name)
  select tests.id(c), '123456789012', 'HDFC0001234', 'HDFC Bank' from (values ('emp1'), ('emp2')) v(c);

insert into public.holidays(location_id, holiday_date, name, type) values
  (tests.id('plant'), '2026-11-09', 'Verna Fest', 'state'),
  (tests.id('ho'), '2026-10-20', 'Optional One', 'optional'),
  (tests.id('ho'), '2026-11-04', 'Optional Two', 'optional'),
  (tests.id('ho'), '2026-11-05', 'Optional Three', 'optional');

-- A valid payload for hr_create_employee, overridable per test.
create function tests.payload(over jsonb default '{}'::jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'full_name', 'New Person', 'email', 'new.person@example.in', 'dob', '1992-02-02', 'gender', 'female',
    'date_of_joining', '2026-10-01', 'designation', 'Executive', 'salary_grade', 'G3',
    'location_id', tests.id('ho'), 'department_id', tests.id('dept'), 'reporting_manager_id', tests.id('mgr'),
    'mobile', '9123456780', 'pin_code', '403001', 'state_code', 'GA',
    'pan', 'AAAAA1111A', 'aadhaar_ct', 'AQID', 'aadhaar_last4', '4321',
    'account_number', '123456789012', 'ifsc', 'HDFC0001234', 'bank_name', 'HDFC Bank') || over
$$;

grant execute on all functions in schema tests to public;
