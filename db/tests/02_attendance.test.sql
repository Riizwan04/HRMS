-- Attendance checklist (brief p.19): IST, Late rule, day status, weekly offs per location, holidays, regularisation,
-- WFH approval and optional holidays (A1-A7, AR-*, LR-20).
begin;
\i db/tests/_fixtures.inc
select no_plan();

create function tests.st(emp text, d date) returns text language sql stable as $$
  select status from public.day_status(tests.id(emp), d, d) $$;
grant execute on function tests.st(text, date) to public;

-- A1/AR-2: one click each; a second check-in the same day does not create a second record
select tests.at('2026-10-16 09:50:00+05:30');
select tests.login('u_emp1');
select ok((public.check_in() ->> 'created')::boolean, 'A1: first check-in creates the record');
select ok(not (public.check_in() ->> 'created')::boolean, 'AR-2: checking in twice does not create a second record');
select is((select count(*)::int from public.attendance where employee_id = tests.id('emp1')), 1, 'AR-2: one record per employee per day');
select tests.at('2026-10-16 18:05:00+05:30');
select ok((public.check_out() ->> 'updated')::boolean, 'A1: check-out records the time');
select ok(not (public.check_out() ->> 'updated')::boolean, 'A1: a second check-out changes nothing');
select tests.logout();

-- IST day boundaries (AR-1): the day is the IST date of the check-in, whatever the UTC or server time
insert into public.attendance(employee_id, check_in) values
  (tests.id('joiner'), '2026-10-05 23:50:00+05:30'),
  (tests.id('joiner'), '2026-10-06 00:05:00+05:30'),
  (tests.id('joiner'), '2026-10-07 00:00:00+00'),
  (tests.id('joiner'), '2026-10-08 18:29:59+00'),
  (tests.id('joiner'), '2026-10-08 18:30:00+00');
select is((select array_agg(work_date order by work_date)::text from public.attendance where employee_id = tests.id('joiner')),
          '{2026-10-05,2026-10-06,2026-10-07,2026-10-08,2026-10-09}',
          'AR-1: 23:50 IST, 00:05 IST, UTC midnight (05:30 IST) and 23:59:59/00:00 IST all land on the right IST day');

-- AR-4 / AR-6: hours, Half Day, Late boundary
insert into public.attendance(employee_id, check_in, check_out) values
  (tests.id('emp2'), '2026-10-12 10:15:00+05:30', '2026-10-12 18:15:00+05:30'),
  (tests.id('emp2'), '2026-10-13 10:15:01+05:30', '2026-10-13 18:20:00+05:30'),
  (tests.id('emp2'), '2026-10-14 10:20:00+05:30', '2026-10-14 15:20:00+05:30'),
  (tests.id('emp2'), '2026-10-15 09:00:00+05:30', '2026-10-15 12:54:00+05:30');
insert into public.attendance(employee_id, check_in) values (tests.id('emp2'), '2026-10-09 09:00:00+05:30');
select tests.login('u_hr');
select is((select (select is_late from public.day_status(tests.id('emp2'), '2026-10-12', '2026-10-12'))), false,
          'AR-6: check-in at exactly 10:15:00 is on time');
select is((select (select is_late from public.day_status(tests.id('emp2'), '2026-10-13', '2026-10-13'))), true,
          'AR-6: check-in at 10:15:01 is Late');
select is(tests.st('emp2', '2026-10-12'), 'present', 'AR-4: 8 hours worked shows Present');
select is(tests.st('emp2', '2026-10-14'), 'half_day', 'AR-4: 5 hours worked shows Half Day');
select is((select (select is_late from public.day_status(tests.id('emp2'), '2026-10-14', '2026-10-14'))), true, 'A2: check-in at 10:20 is marked Late');
select is(tests.st('emp2', '2026-10-15'), 'absent', 'AR-4: under 4 hours is Absent');
select is(tests.st('emp2', '2026-10-09'), 'absent', 'AR-8: check-in without check-out is Absent');
select ok((select missing_checkout from public.day_status(tests.id('emp2'), '2026-10-09', '2026-10-09')), 'AR-8: flagged as missing check-out');

-- AR-3: a plant employee's Saturday is a working day; a head-office employee's Saturday is a weekly off
select is(tests.st('emp1', '2026-10-10'), 'weekly_off', 'AR-3: head office Saturday is a Weekly Off');
select is(tests.st('plant1', '2026-10-10'), 'absent', 'AR-3: plant Saturday is a working day (no punch = Absent)');
select is(tests.st('plant1', '2026-10-11'), 'weekly_off', 'AR-3: plant Sunday is a Weekly Off');

-- A7/AR-12: a state holiday added for Verna does not appear for Panaji
select ok(not (select counts from public.count_working_days(tests.id('plant1'), '2026-11-09', '2026-11-09')), 'AR-12: Verna holiday is not a working day at Verna');
select ok((select counts from public.count_working_days(tests.id('emp1'), '2026-11-09', '2026-11-09')), 'AR-12: the Verna holiday does not exist for Panaji');
select is(tests.st('plant1', '2026-11-09'), 'holiday', 'AR-12: day status shows Holiday at Verna');

-- A5/AR-11: regularisation changes attendance only after manager approval
select tests.login('u_emp1');
select is(tests.st('emp1', '2026-10-14'), 'absent', 'A5: missed day starts as Absent');
select lives_ok($$ select public.request_regularisation('2026-10-14', '2026-10-14 09:55+05:30', '2026-10-14 18:00+05:30', 'Forgot to punch') $$,
                'A5: employee requests a correction with a reason');
select is(tests.st('emp1', '2026-10-14'), 'absent', 'AR-11: attendance is unchanged while the request is pending');
select throws_ok($$ select public.request_regularisation('2026-10-14', '2026-10-14 09:55+05:30', '2026-10-14 18:00+05:30', 'Again again') $$,
                 'P0001', 'duplicate_request', 'AR-11: one pending request per employee per day');
select throws_ok($$ select public.request_regularisation('2026-08-01', '2026-08-01 09:55+05:30', null, 'Too old a request') $$,
                 'P0001', 'outside_window', 'AR-11: cannot regularise beyond 30 days back');
select throws_ok($$ select public.decide_regularisation((select id from public.regularisation_requests limit 1), 'approve', null) $$,
                 'P0001', 'forbidden', 'LR-21: the employee cannot approve their own request');
select tests.login('u_mgr2');
select throws_ok($$ select public.decide_regularisation((select id from public.regularisation_requests limit 1), 'approve', null) $$,
                 'P0001', 'not_found', 'LR-21: another team''s manager cannot even see the request');
select tests.login('u_mgr');
select throws_ok($$ select public.decide_regularisation((select id from public.regularisation_requests limit 1), 'reject', '') $$,
                 'P0001', 'comment_required', 'A5: a rejection needs a comment');
select lives_ok($$ select public.decide_regularisation((select id from public.regularisation_requests limit 1), 'approve', 'ok') $$,
                'A5: the manager approves');
select tests.login('u_hr');
select is(tests.st('emp1', '2026-10-14'), 'present', 'A5: attendance changes after approval (9:55 to 18:00 = Present)');
select is((select source::text from public.attendance where employee_id = tests.id('emp1') and work_date = '2026-10-14'), 'regularised',
          'AR-11: the record is marked as regularised');
select tests.login('u_emp1');
select lives_ok($$ select public.request_regularisation('2026-10-09', '2026-10-09 09:30+05:30', '2026-10-09 17:30+05:30', 'Phone was dead') $$, 'A5: second request');
select tests.login('u_mgr');
select lives_ok($$ select public.decide_regularisation((select id from public.regularisation_requests where work_date = '2026-10-09'), 'reject', 'No proof') $$,
                'A5: manager rejects with a comment');
select tests.login('u_hr');
select is(tests.st('emp1', '2026-10-09'), 'absent', 'AR-11: a rejected request leaves attendance unchanged');

-- A3/AR-7: WFH counts as Present only after the manager approves
select tests.login('u_emp2');
select throws_ok($$ select public.request_wfh('2026-10-17', 'Working from home') $$, 'P0001', 'not_working_day',
                 'AR-7: WFH cannot be requested for a weekly off');
select throws_ok($$ select public.request_wfh('2026-10-15', 'Working from home') $$, 'P0001', 'date_in_past', 'AR-7: WFH cannot be requested for a past day');
select lives_ok($$ select public.request_wfh('2026-10-19', 'Plumber visiting home') $$, 'A3: employee requests a WFH day');
select tests.login('u_hr');
select is(tests.st('emp2', '2026-10-19'), 'future', 'AR-7: a pending WFH request has no effect on status');
select tests.login('u_emp2');
select throws_ok($$ select public.decide_wfh((select id from public.wfh_requests limit 1), 'approve', null) $$, 'P0001', 'forbidden',
                 'LR-21: the employee cannot approve their own WFH');
select tests.login('u_mgr');
select lives_ok($$ select public.decide_wfh((select id from public.wfh_requests limit 1), 'approve', null) $$, 'A3: the manager approves WFH');
select tests.login('u_hr');
select is((select row(status, is_wfh, present_fraction)::text from public.day_status(tests.id('emp2'), '2026-10-19', '2026-10-19')),
          '(present,t,1)', 'AR-7: approved WFH is 1.0 Present');

-- LR-20: optional holidays, 2 per calendar year, approval makes them paid holidays
select tests.login('u_emp1');
select lives_ok(format($$ select public.request_optional_holiday(%L) $$, (select id from public.holidays where name = 'Optional One')), 'LR-20: choose the first optional holiday');
select lives_ok(format($$ select public.request_optional_holiday(%L) $$, (select id from public.holidays where name = 'Optional Two')), 'LR-20: choose the second');
select throws_ok(format($$ select public.request_optional_holiday(%L) $$, (select id from public.holidays where name = 'Optional Three')),
                 'P0001', 'optional_quota_exceeded', 'LR-20: a third optional holiday in the year is refused');
select ok((select counts from public.count_working_days(tests.id('emp1'), '2026-10-20', '2026-10-20')), 'LR-20: an unapproved optional day is still a working day');
select tests.login('u_mgr');
select lives_ok(format($$ select public.decide_optional_holiday(%L, 'approve', null) $$,
                       (select r.id from public.optional_holiday_requests r join public.holidays h on h.id = r.holiday_id where h.name = 'Optional One')),
                'LR-20: the manager approves the optional holiday');
select tests.login('u_hr');
select is((select reason from public.count_working_days(tests.id('emp1'), '2026-10-20', '2026-10-20')), 'optional_holiday',
          'LR-20: approved optional holiday is excluded from working days');
select is(tests.st('emp1', '2026-10-20'), 'holiday', 'LR-20: day status shows Holiday');
select ok((select counts from public.count_working_days(tests.id('emp2'), '2026-10-20', '2026-10-20')), 'LR-20: other employees still work that day');
select tests.login('u_emp1');
select lives_ok(format($$ select public.cancel_request('optional_holiday', %L) $$,
                       (select r.id from public.optional_holiday_requests r join public.holidays h on h.id = r.holiday_id where h.name = 'Optional Two')),
                'LR-20: cancelling frees the quota');
select lives_ok(format($$ select public.request_optional_holiday(%L) $$, (select id from public.holidays where name = 'Optional Three')),
                'LR-20: a new choice is now allowed');
select tests.login('u_plant1');
select throws_ok(format($$ select public.request_optional_holiday(%L) $$, (select id from public.holidays where name = 'Optional One')),
                 'P0001', 'wrong_location', 'LR-20: an optional holiday of another site cannot be chosen');

select * from finish();
rollback;
