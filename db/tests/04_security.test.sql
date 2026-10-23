-- Security and roles (brief p.19, rubric 10%): deactivation, RLS, grants, least privilege, agent drafts.
begin;
\i db/tests/_fixtures.inc
select no_plan();

-- E6: deactivated employee cannot use the system after the last working day; the record is never deleted -------------------
select tests.login('u_hr');
select throws_ok(format($$ select public.deactivate_employee(%L, '2026-10-20') $$, tests.id('hr')), 'P0001', 'cannot_deactivate_self',
                 'DV-11: HR cannot deactivate themselves');
select tests.logout();
select throws_ok(format($$ update public.employees set status = 'inactive', last_working_day = '2026-10-20' where id = %L $$, tests.id('mgr')),
                 'P0001', 'has_active_reports', 'DV-11: a manager with active reports cannot be deactivated');
select throws_ok(format($$ update public.employees set is_hr_admin = false where id = %L $$, tests.id('hr')),
                 'P0001', 'last_hr_admin', 'the last HR Admin cannot be removed');
select tests.login('u_hr');
select lives_ok(format($$ select public.deactivate_employee(%L, '2026-10-16') $$, tests.id('emp2')), 'E6: HR sets a last working day (today)');
select tests.login('u_emp2');
select lives_ok($$ select public.check_in() $$, 'DV-12: the employee can still work on the last working day');
select tests.logout();
select tests.at('2026-10-17 09:00:00+05:30');
select tests.login('u_emp2');
select throws_ok($$ select public.check_in() $$, 'P0001', 'not_authenticated', 'E6/DV-12: after the last working day the employee is locked out');
select is(public.whoami(), null::jsonb, 'E6: whoami is empty for a deactivated employee (redirect to access-denied)');
select throws_ok($$ delete from public.employees $$, '42501', null, 'E6: records are never deleted (no delete permission)');
select tests.logout();
select is((select count(*)::int from public.employees where id = tests.id('emp2')), 1, 'E6: the deactivated employee''s record still exists');
select tests.at('2026-10-16 12:00:00+05:30');

-- Unlinked or unknown sign-ins get nothing -------------------------------------------------------------------------------------
select tests.login('u_nobody');
select is((select count(*)::int from public.holidays), 0, 'default-deny: an unlinked Clerk user sees no data at all');
select is(public.whoami(), null::jsonb, 'default-deny: whoami is empty for an unlinked user');
select throws_ok($$ select public.check_in() $$, 'P0001', 'not_authenticated', 'default-deny: an unlinked user cannot act');
select throws_ok($$ select public.apply_leave(tests.lt('CL'), '2026-10-23', '2026-10-23', false, null, 'Trying anyway', null, false) $$,
                 'P0001', 'not_authenticated', 'default-deny: an unlinked user cannot apply for leave');

-- Row visibility: self, direct manager, HR -------------------------------------------------------------------------------------
select tests.logout();
insert into public.attendance(employee_id, check_in) values (tests.id('emp1'), '2026-10-14 09:30+05:30'), (tests.id('emp2'), '2026-10-14 09:31+05:30');
select tests.login('u_emp1');
select is((select count(*)::int from public.attendance), 1, 'RLS: an employee sees only their own attendance');
select tests.login('u_mgr');
select is((select count(*)::int from public.attendance), 3, 'RLS: a manager sees their direct reports (1 + 2 rows)');
select tests.login('u_mgr2');
select is((select count(*)::int from public.attendance), 0, 'RLS: another manager sees none of them');
select tests.login('u_hr');
select is((select count(*)::int from public.attendance), 3, 'RLS: HR sees all');

-- Team scope on the rule functions (the agent and screens reuse these) ---------------------------------------------------------------
select tests.login('u_mgr');
select lives_ok(format($$ select * from public.day_status(%L, '2026-10-14', '2026-10-14') $$, tests.id('emp1')), 'a manager can view a direct report''s day status');
select throws_ok(format($$ select * from public.day_status(%L, '2026-10-14', '2026-10-14') $$, tests.id('plant1')), 'P0001', 'forbidden',
                 'a manager cannot view someone outside their team');
select tests.login('u_emp1');
select throws_ok(format($$ select * from public.leave_balances(%L, 2026) $$, tests.id('emp2')), 'P0001', 'forbidden',
                 'an employee cannot read a colleague''s balance');
select throws_ok(format($$ select * from public.day_status(%L, '2026-10-14', '2026-10-14') $$, tests.id('emp2')), 'P0001', 'forbidden',
                 'an employee cannot view team attendance');
select throws_ok($$ select * from public.team_members() $$, 'P0001', null, 'placeholder')
  where false;
select is((select count(*)::int from public.team_members()), 0, 'an employee has no team list');
select throws_ok($$ select public.hr_create_employee('{}') $$, 'P0001', 'forbidden', 'role checks live in the database: employee cannot add employees');

-- Server-enforced role checks cannot be bypassed by calling the functions directly --------------------------------------------------
select tests.login('u_mgr');
select throws_ok($$ select public.hr_upsert_holiday('{"location_id":"00000000-0000-0000-0000-000000000000","holiday_date":"2026-12-25","name":"x","type":"state"}') $$,
                 'P0001', 'forbidden', 'a manager cannot configure holidays');
select throws_ok(format($$ select public.reveal_statutory(%L, 'pan') $$, tests.id('emp1')), 'P0001', 'forbidden', 'a manager cannot reveal PAN');
select throws_ok(format($$ select public.hr_adjust_leave(%L, tests.lt('CL'), 2026, 5, 'Free days') $$, tests.id('emp1')), 'P0001', 'forbidden',
                 'a manager cannot give anyone extra leave');

-- Raw tables and direct writes are closed ---------------------------------------------------------------------------------------------
select tests.login('u_hr');
select throws_ok($$ select * from public.employee_statutory $$, '42501', null, 'raw statutory table is closed even to HR (masked view only)');
select throws_ok($$ select * from public.employee_bank $$, '42501', null, 'raw bank table is closed even to HR');
select is((select count(*)::int from public.v_statutory_masked), 2, 'HR reads masked statutory rows for everyone');
select tests.login('u_emp1');
select is((select count(*)::int from public.v_statutory_masked), 1, 'an employee reads only their own masked statutory row');
select throws_ok($$ insert into public.attendance(employee_id, check_in) values (tests.id('emp1'), now()) $$, '42501', null, 'no direct insert into attendance');
select throws_ok($$ update public.leave_requests set status = 'approved' $$, '42501', null, 'no direct update of leave requests');
select throws_ok($$ update public.employees set is_hr_admin = true where id = tests.id('emp1') $$, '42501', null, 'an employee cannot make themselves HR Admin');
select throws_ok($$ select * from public.email_outbox $$, '42501', null, 'the email outbox is not readable by users');
select is((select count(*)::int from public.audit_log), 0, 'the audit log is invisible to a normal employee');
select tests.login('u_hr');
select ok((select count(*) from public.audit_log) > 0, 'HR can read the audit log');

-- Least privilege: the runtime login and PUBLIC ----------------------------------------------------------------------------------------
select tests.logout();
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'private') and has_function_privilege('public', p.oid, 'execute')
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')), 0,
          'no function in public/private is executable by PUBLIC');
select is((select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('app_runtime', p.oid, 'execute')
              and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')),
          'link_clerk_user,outbox_claim,outbox_mark', 'the runtime login may execute only its three system functions directly');
set local role app_runtime;
select throws_ok($$ select count(*) from public.employees $$, '42501', null, 'the runtime login cannot read any table directly');
select throws_ok($$ select public.apply_leave(null, null, null, null, null, null) $$, '42501', null, 'the runtime login cannot call app functions directly');
reset role;
insert into public.employees(full_name, email, dob, gender, date_of_joining, designation, location_id, department_id, reporting_manager_id)
  values ('Gita Ghost', 'ghost@example.in', '1995-05-05', 'female', '2026-10-01', 'Staff', tests.id('ho'), tests.id('dept'), tests.id('mgr'));
set local role app_runtime;
select ok(public.link_clerk_user('u_ghost', 'ghost@example.in') is not null, 'first login links the Clerk user to the employee by email');
select is(public.link_clerk_user('u_other', 'ghost@example.in'), null::uuid, 'a different Clerk user cannot take over an already linked employee');
reset role;
select tests.login('u_emp1');
select throws_ok($$ select public.outbox_claim(5) $$, '42501', null, 'users cannot call the email system functions');
select tests.logout();

-- Agent: drafts are owner-only, expire, and are the only write path ------------------------------------------------------------------------
select tests.login('u_emp1');
select lives_ok(format($$ select public.create_draft('leave_request', %L::jsonb) $$,
  json_build_object('leave_type_id', tests.lt('CL'), 'from_date', '2026-10-23', 'to_date', '2026-10-26', 'reason', 'Family function')::text),
  'agent: a leave draft is created');
select tests.logout();
insert into tests.ids select 'draft1', id from public.agent_drafts where employee_id = tests.id('emp1');
select is((select count(*)::int from public.leave_requests), 0, 'agent: nothing is submitted until the user confirms');
select tests.login('u_emp1');
select tests.logout();
select tests.login('u_mgr');
select throws_ok(format($$ select public.confirm_draft(%L) $$, tests.id('draft1')), 'P0001', 'not_found', 'agent: nobody else can confirm my draft');
select tests.login('u_emp1');
select is((public.confirm_draft(tests.id('draft1')) ->> 'ok')::boolean, true, 'agent: confirming submits the leave through the normal rules');
select throws_ok(format($$ select public.confirm_draft(%L) $$, tests.id('draft1')), 'P0001', 'draft_not_open', 'agent: a draft cannot be confirmed twice');
select is((select count(*)::int from public.leave_requests where status = 'pending'), 1, 'agent: exactly one request exists after confirmation');
select lives_ok(format($$ select public.create_draft('leave_request', %L::jsonb) $$,
  json_build_object('leave_type_id', tests.lt('CL'), 'from_date', '2026-11-02', 'to_date', '2026-11-02', 'reason', 'One more day off')::text), 'agent: a second draft');
select tests.logout();
insert into tests.ids select 'draft2', id from public.agent_drafts where employee_id = tests.id('emp1') and status = 'draft';
select tests.at('2026-10-16 12:20:00+05:30');
select tests.login('u_emp1');
select throws_ok(format($$ select public.confirm_draft(%L) $$, tests.id('draft2')), 'P0001', 'draft_expired', 'agent: drafts expire after 15 minutes');
select lives_ok(format($$ insert into public.agent_log(employee_id, conversation_id, tool, outcome) values (%L, gen_random_uuid(), 'get_my_leave_balance', 'ok') $$, tests.id('emp1')),
                'agent_log: a user can log their own tool calls');
select throws_ok(format($$ insert into public.agent_log(employee_id, conversation_id, tool, outcome) values (%L, gen_random_uuid(), 'get_my_leave_balance', 'ok') $$, tests.id('emp2')),
                 '42501', null, 'agent_log: a user cannot write log rows for someone else');
select throws_ok(format($$ select public.create_draft('hr_reminder_email', %L::jsonb) $$, '{}'), 'P0001', 'forbidden', 'agent: only HR can draft reminder emails');

-- Policy search comes only from stored text -------------------------------------------------------------------------------------------------
select ok((select count(*) from public.search_policy('what is the sandwich rule for leave')) > 0, 'policy: a covered question finds the stored text');
select is((select count(*)::int from public.search_policy('what is the dress code')), 0, 'policy: an uncovered question finds nothing, so the agent says it does not know');

select * from finish();
rollback;
