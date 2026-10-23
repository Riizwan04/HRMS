-- Leave checklist (brief p.19) + month-end reconciliation (L1-L8, LR-*).
begin;
\i db/tests/_fixtures.inc
select no_plan();

create function tests.bal(emp text, code text, col text, yr int default 2026) returns numeric language plpgsql stable as $$
declare v numeric;
begin
  execute format('select %I from public.leave_balances(%L, %s) where code = %L', col, tests.id(emp), yr, code) into v;
  return v;
end $$;
grant execute on function tests.bal(text, text, text, int) to public;

-- LR-3: pro-rating for joiners, nearest 0.5, exact quarters round up ---------------------------------------------
select tests.login('u_hr');
select is(tests.bal('joiner', 'CL', 'accrued'), 4.0, 'L2/LR-3: joined 1 July sees pro-rated CL 4.0');
select is(tests.bal('joiner', 'SL', 'accrued'), 3.5, 'L2/LR-3: joined 1 July sees pro-rated SL 3.5');
select tests.logout();
select is(private.prorated(8, date '2026-07-16'), 3.5, 'LR-3: joined 16 July (5 months) CL 3.5');
select is(private.prorated(7, date '2026-07-16'), 3.0, 'LR-3: joined 16 July SL 3.0');
select is(private.prorated(7, date '2026-10-01'), 2.0, 'LR-3: exact quarter (1.75) rounds up to 2.0');

-- LR-4 / LR-5: EL accrues per completed month and carries up to 30; CL lapses ---------------------------------------
select tests.login('u_hr');
select is(tests.bal('emp1', 'EL', 'opening'), 13.75, 'LR-4: EL carried from 2025 (11 completed months x 1.25)');
select is(tests.bal('emp1', 'EL', 'accrued'), 11.25, 'LR-4: EL 2026 = 9 completed months x 1.25');
select is(tests.bal('hr', 'EL', 'opening'), 30.0, 'LR-4: carry-forward is capped at 30 days');
select is(tests.bal('emp1', 'CL', 'opening'), 0.0, 'LR-5: CL does not carry forward');

-- LR-6: working days. No sandwich rule; location decides ------------------------------------------------------------
select tests.login('u_emp1');
select is((public.preview_leave(tests.lt('CL'), '2026-10-23', '2026-10-26') ->> 'days')::numeric, 2.0,
          'L3/LR-6: Friday to Monday at head office counts 2 days, not 4');
select tests.login('u_plant1');
select is((public.preview_leave(tests.lt('CL'), '2026-10-23', '2026-10-26') ->> 'days')::numeric, 3.0,
          'LR-6: Friday to Monday at the plant counts 3 days (Saturday is a working day)');

-- LR-8: insufficient balance offers conversion to LOP ----------------------------------------------------------------
select tests.login('u_emp1');
select is((public.preview_leave(tests.lt('CL'), '2026-11-02', '2026-11-13', false, null, false, false) -> 'errors' -> 0 ->> 'code'),
          'insufficient_balance', 'LR-8: more CL than available is refused...');
select is((public.preview_leave(tests.lt('CL'), '2026-11-02', '2026-11-13', false, null, false, false) -> 'errors' -> 0 ->> 'excess')::numeric, 2.0,
          'LR-8: ...and the excess to convert is reported');
select is((select row(round((p ->> 'paid_days')::numeric, 1), round((p ->> 'lop_days')::numeric, 1), (p ->> 'can_submit')::boolean)::text
             from (select public.preview_leave(tests.lt('CL'), '2026-11-02', '2026-11-13', false, null, true, false) p) q),
          '(8.0,2.0,t)', 'LR-8: with conversion, 8 paid + 2 LOP and it can be submitted');

-- LR-9: sick leave over 2 days needs a certificate ----------------------------------------------------------------------
select is((public.preview_leave(tests.lt('SL'), '2026-11-16', '2026-11-18', false, null, false, false) -> 'errors' -> 0 ->> 'code'),
          'document_required', 'L3/LR-9: SL of 3 days cannot be submitted without a certificate');
select is((public.preview_leave(tests.lt('SL'), '2026-11-16', '2026-11-18', false, null, false, true) ->> 'can_submit')::boolean, true,
          'LR-9: with a certificate it can be submitted');
select is((public.preview_leave(tests.lt('SL'), '2026-11-16', '2026-11-17', false, null, false, false) ->> 'can_submit')::boolean, true,
          'LR-9: SL of 2 days needs no certificate');

-- LR-13: back-dating limit ------------------------------------------------------------------------------------------------
select is((public.preview_leave(tests.lt('CL'), '2026-09-16', '2026-09-16') ->> 'can_submit')::boolean, true, 'LR-13: 30 days back is allowed');
select is((public.preview_leave(tests.lt('CL'), '2026-09-15', '2026-09-15') -> 'errors' -> 0 ->> 'code'), 'too_far_back', 'LR-13: 31 days back is refused');

-- LR-2 / L4 / L5: pending does not change the balance; approval does; cancelling restores ---------------------------------
select is(tests.bal('emp1', 'CL', 'available'), 8.0, 'L2: CL available before any request');
select tests.logout();
select tests.login('u_emp1');
select is((public.apply_leave(tests.lt('CL'), '2026-10-23', '2026-10-26', false, null, 'Family function', null, false) ->> 'ok')::boolean, true,
          'L3: employee applies for leave');
select tests.logout();
insert into tests.ids select 'req1', id from public.leave_requests where employee_id = tests.id('emp1');
select tests.login('u_emp1');
select is(tests.bal('emp1', 'CL', 'available'), 8.0, 'LR-2: balance does not change while the request is pending');
select is(tests.bal('emp1', 'CL', 'pending'), 2.0, 'LR-2: pending days are shown separately');
select is((public.apply_leave(tests.lt('CL'), '2026-10-26', '2026-10-27', false, null, 'Overlapping plan', null, false) -> 'errors' -> 0 ->> 'code'),
          'overlap', 'LR-14: overlapping leave is refused');
select throws_ok(format($$ select public.decide_leave(%L, 'approve', null) $$, tests.id('req1')), 'P0001', 'forbidden',
                 'L4/LR-15: an employee cannot approve their own leave');
select tests.login('u_mgr2');
select throws_ok(format($$ select public.decide_leave(%L, 'approve', null) $$, tests.id('req1')), 'P0001', 'forbidden',
                 'LR-15: another team''s manager cannot approve it');
select tests.login('u_mgr');
select throws_ok(format($$ select public.decide_leave(%L, 'reject', '') $$, tests.id('req1')), 'P0001', 'comment_required',
                 'L4: rejecting needs a comment');
select lives_ok(format($$ select public.decide_leave(%L, 'approve', 'Enjoy') $$, tests.id('req1')), 'L4: the manager approves');
select tests.login('u_emp1');
select is(row(round(tests.bal('emp1', 'CL', 'used'), 1), round(tests.bal('emp1', 'CL', 'available'), 1))::text, '(2.0,6.0)', 'L4/LR-2: balance changes on approval');
select is((select status from public.day_status(tests.id('emp1'), '2026-10-23', '2026-10-23')), 'on_leave', 'AR-9: approved leave day shows On Leave');
select is((public.cancel_leave(tests.id('req1')) ->> 'ok')::boolean, true, 'L5: employee cancels approved leave that has not started');
select is(row(round(tests.bal('emp1', 'CL', 'used'), 1), round(tests.bal('emp1', 'CL', 'available'), 1))::text, '(0.0,8.0)', 'L5/LR-16: balance is restored');
select tests.logout();
select ok(exists (select 1 from public.email_outbox where template = 'leave_requested' and to_email = 'u_mgr@example.in'), 'L6: the manager is emailed on a new request');
select ok(exists (select 1 from public.email_outbox where template = 'leave_decided' and to_email = 'u_emp1@example.in'), 'L6: the employee is emailed on the decision');

-- LR-15: the balance is re-checked at approval time -----------------------------------------------------------------------
select tests.login('u_emp1');
select public.apply_leave(tests.lt('CL'), '2026-12-07', '2026-12-08', false, null, 'Short trip planned', null, false);
select tests.login('u_hr');
select public.hr_adjust_leave(tests.id('emp1'), tests.lt('CL'), 2026, -7, 'Correction after audit');
select tests.logout();
insert into tests.ids select 'req2', id from public.leave_requests where employee_id = tests.id('emp1') and status = 'pending';
select tests.login('u_mgr');
select throws_ok(format($$ select public.decide_leave(%L, 'approve', null) $$, tests.id('req2')), 'P0001', 'insufficient_balance',
                 'LR-15: approval is refused when the balance is no longer sufficient');
select tests.login('u_hr');
select public.hr_adjust_leave(tests.id('emp1'), tests.lt('CL'), 2026, 7, 'Reverse the correction');
select lives_ok(format($$ select public.decide_leave(%L, 'approve', 'fine') $$, tests.id('req2')), 'LR-21: HR can approve any request');

-- LR-11: a holiday added over approved leave releases it ---------------------------------------------------------------------
select tests.login('u_emp2');
select public.apply_leave(tests.lt('CL'), '2026-11-10', '2026-11-10', false, null, 'Personal errand', null, false);
select tests.logout();
insert into tests.ids select 'req3', id from public.leave_requests where employee_id = tests.id('emp2') and from_date = '2026-11-10';
select tests.login('u_mgr');
select public.decide_leave(tests.id('req3'), 'approve', null);
select tests.login('u_emp2');
select is(tests.bal('emp2', 'CL', 'used'), 1.0, 'LR-11: leave approved before the holiday exists');
select tests.login('u_hr');
select public.hr_upsert_holiday(jsonb_build_object('location_id', tests.id('ho'), 'holiday_date', '2026-11-10', 'name', 'New State Holiday', 'type', 'state'));
select tests.login('u_emp2');
select is(row(round(tests.bal('emp2', 'CL', 'used'), 1), round(tests.bal('emp2', 'CL', 'available'), 1))::text, '(0.0,8.0)',
          'LR-11: the leave day is released and the balance restored automatically');
select is((select status::text from public.leave_requests where id = tests.id('req3')), 'cancelled', 'LR-11: a request left with no leave days is cancelled');

-- LR-12: maternity (26 weeks, calendar days, no deduction) and paternity (5 working days) ------------------------------------
select tests.login('u_emp1');
select is((public.preview_leave(tests.lt('ML'), '2026-12-14', '2027-06-13', false, null, false, true) ->> 'days')::numeric, 182.0,
          'LR-12: maternity counts 182 calendar days (26 weeks) including weekly offs');
select is((public.preview_leave(tests.lt('ML'), '2026-12-14', '2027-06-13', false, null, false, true) ->> 'can_submit')::boolean, true,
          'LR-12: 26 weeks is accepted with the certificate');
select is((public.preview_leave(tests.lt('ML'), '2026-12-14', '2027-06-14', false, null, false, true) -> 'errors' -> 0 ->> 'code'), 'exceeds_max_days',
          'LR-12: more than 26 weeks is refused');
select is((public.preview_leave(tests.lt('ML'), '2026-12-14', '2027-06-13', false, null, false, false) -> 'errors' -> 0 ->> 'code'), 'document_required',
          'LR-12: maternity needs a supporting document');
select is((public.preview_leave(tests.lt('PL'), '2026-11-16', '2026-11-20') -> 'errors' -> 0 ->> 'code'), 'type_not_applicable',
          'LR-12: paternity is for male employees only');
select tests.login('u_emp2');
select is((public.preview_leave(tests.lt('ML'), '2026-11-16', '2026-11-20', false, null, false, true) -> 'errors' -> 0 ->> 'code'), 'type_not_applicable',
          'LR-12: maternity is for female employees only');
select is((public.preview_leave(tests.lt('PL'), '2026-11-13', '2026-11-19') ->> 'days')::numeric, 5.0,
          'LR-12: paternity of 5 consecutive working days skips the weekend (no sandwich rule)');
select is((public.preview_leave(tests.lt('PL'), '2026-11-16', '2026-11-23') -> 'errors' -> 0 ->> 'code'), 'exceeds_max_days',
          'LR-12: a 6th working day is refused');
select tests.login('u_emp1');
select is((public.apply_leave(tests.lt('ML'), '2026-12-14', '2027-06-13', false, null, 'Expecting a baby', 'cert/path.pdf', false) ->> 'ok')::boolean, true,
          'LR-12: maternity request is submitted');
select is(tests.bal('emp1', 'CL', 'available'), 6.0, 'LR-12: maternity makes zero deduction from CL (6.0 = 8 less the 2 days approved earlier)');
select is(tests.bal('emp1', 'EL', 'available'), 25.0, 'LR-12: ...and from EL');

-- LR-18 / L8: month-end summary reconciles with the calendar for three sample employees (Sept 2026) --------------------------
select tests.logout();
insert into public.holidays(location_id, holiday_date, name, type) values (tests.id('ho'), '2026-09-18', 'HO Fest', 'state'), (tests.id('plant'), '2026-09-14', 'Plant Fest', 'state');
insert into public.attendance(employee_id, check_in, check_out) values
  (tests.id('emp1'), '2026-09-07 10:30+05:30', '2026-09-07 18:30+05:30'),
  (tests.id('emp1'), '2026-09-08 10:30+05:30', '2026-09-08 18:30+05:30'),
  (tests.id('emp1'), '2026-09-09 10:30+05:30', '2026-09-09 18:30+05:30'),
  (tests.id('emp1'), '2026-09-10 09:00+05:30', '2026-09-10 13:30+05:30'),
  (tests.id('emp2'), '2026-09-21 09:00+05:30', '2026-09-21 13:00+05:30'),
  (tests.id('emp2'), '2026-09-22 09:00+05:30', '2026-09-22 17:00+05:30'),
  (tests.id('plant1'), '2026-09-05 09:00+05:30', '2026-09-05 17:00+05:30'),
  (tests.id('plant1'), '2026-09-07 09:00+05:30', '2026-09-07 17:00+05:30');
insert into public.wfh_requests(employee_id, work_date, reason, status, decided_by) values
  (tests.id('emp1'), '2026-09-14', 'Work from home day', 'approved', tests.id('mgr'));
create function tests.leave_row(emp text, d1 date, d2 date, code text, frac numeric) returns void language plpgsql as $$
declare rid uuid; d date;
begin
  insert into public.leave_requests(employee_id, leave_type_id, from_date, to_date, is_half_day, half_day_session, days, reason, status, decided_by)
  values (tests.id(emp), tests.lt(code), d1, d2, frac = 0.5, case when frac = 0.5 then 'first' end, (d2 - d1 + 1) * frac, 'Sample leave', 'approved', tests.id('mgr'))
  returning id into rid;
  for d in select g::date from generate_series(d1, d2, interval '1 day') g loop
    insert into public.leave_request_days(request_id, employee_id, leave_date, leave_type_id, day_fraction) values (rid, tests.id(emp), d, tests.lt(code), frac);
  end loop;
end $$;
select tests.leave_row('emp1', '2026-09-15', '2026-09-16', 'CL', 1);
select tests.leave_row('emp2', '2026-09-21', '2026-09-21', 'CL', 0.5);
select tests.leave_row('emp2', '2026-09-22', '2026-09-22', 'SL', 1);
select tests.leave_row('plant1', '2026-09-08', '2026-09-09', 'EL', 1);
select tests.login('u_hr');
select is((select row(round(present_days, 1), round(wfh_days, 1), round(cl, 1), round(lop_days, 1), holidays, weekly_offs, late_marks, days_employed)::text
             from public.month_summary('2026-09-01') where employee_code = (select employee_code from public.employees where id = tests.id('emp1'))),
          '(3.0,1.0,2.0,15.0,1,8,3,30)', 'L8/LR-18: sample employee 1 - present, WFH, leave, LOP incl. late-LOP, holiday, weekly offs');
select ok((select bool_and(present_days + wfh_days + cl + sl + el + ml + pl + lop_days + holidays + weekly_offs = days_employed)
             from public.month_summary('2026-09-01') where full_name in ('Asha Naik', 'Ravi Kamat', 'Pavan Fal')),
          'LR-18: for all three sample employees present + WFH + leave + LOP + holidays + weekly offs = days employed');
select is((select row(round(present_days, 1), round(cl, 1), round(sl, 1), round(lop_days, 1))::text from public.month_summary('2026-09-01') where full_name = 'Ravi Kamat'),
          '(0.5,0.5,1.0,19.0)'::text, 'LR-18: half-day leave + 4 hours worked = 0.5 leave + 0.5 present; leave beats punch on a full leave day');
select tests.login('u_mgr');
select is((select count(*)::int from public.month_summary('2026-09-01')), 3, 'L8: a manager''s summary covers only their own team');
select tests.login('u_emp1');
select throws_ok($$ select * from public.month_summary('2026-09-01') $$, 'P0001', 'forbidden', 'L8: an employee cannot download the month-end summary');

select * from finish();
rollback;
