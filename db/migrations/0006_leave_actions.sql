-- 0006_leave_actions: preview / apply / decide / cancel leave, adjustments, release of conflicting leave.
-- Every function takes the acting employee from the session claim (never a parameter) and is atomic.

create function private.queue_email(p_to text, p_template text, p_payload jsonb, p_related uuid default null)
returns void language sql security definer set search_path = public, private, pg_temp as $$
  insert into public.email_outbox(to_email, template, payload, related_id) values (p_to, p_template, p_payload, p_related)
$$;

-- Who should be told about a new request: the manager, or HR admins when there is no manager (LR-19).
create function private.approver_emails(emp uuid) returns setof text
language sql stable security definer set search_path = public, private, pg_temp as $$
  select m.email::text from public.employees e join public.employees m on m.id = e.reporting_manager_id
   where e.id = emp and m.status = 'active'
  union all
  select h.email::text from public.employees h
   where h.is_hr_admin and h.status = 'active' and h.id <> emp
     and not exists (select 1 from public.employees e2 join public.employees m2 on m2.id = e2.reporting_manager_id
                      where e2.id = emp and m2.status = 'active')
$$;

-- Core planner: validates a leave request and computes days, LOP split and balance (LR-6..LR-14).
create function private.leave_plan(
  p_emp uuid, p_type uuid, p_from date, p_to date, p_half boolean, p_session text,
  p_convert boolean, p_has_doc boolean)
returns jsonb
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  e public.employees; t public.leave_types; r public.leave_type_rules; lop_id uuid;
  today date := private.today_ist();
  errors jsonb := '[]'::jsonb;
  breakdown jsonb := '[]'::jsonb;
  day_rows jsonb := '[]'::jsonb;
  d date; o record; counts boolean; frac numeric;
  total numeric := 0; paid numeric := 0; lop numeric := 0;
  overlap_dates text[];
  yr integer; avail numeric; pend numeric; paid_left jsonb := '{}'::jsonb; need_conv boolean := false;
  first_avail numeric; first_pend numeric; first_year integer;
  balance_tracked boolean;
  excess_total numeric := 0;
  day_paid boolean;
begin
  select * into e from public.employees where id = p_emp;
  select * into t from public.leave_types where id = p_type and is_active;
  if t.id is null then
    return jsonb_build_object('errors', jsonb_build_array(jsonb_build_object('code', 'unknown_type')));
  end if;
  select id into lop_id from public.leave_types where code = 'LOP';
  r := private.rule_for(p_type, extract(year from p_from)::int);

  if t.applicable_gender <> 'any' and t.applicable_gender::text <> e.gender::text then
    errors := errors || jsonb_build_object('code', 'type_not_applicable');
  end if;
  if p_to < p_from then
    return jsonb_build_object('errors', errors || jsonb_build_object('code', 'invalid_range'));
  end if;
  if p_to - p_from > 400 then
    return jsonb_build_object('errors', errors || jsonb_build_object('code', 'range_too_large'));
  end if;
  if p_half then
    if p_from <> p_to then errors := errors || jsonb_build_object('code', 'half_day_single_date'); end if;
    if not coalesce(r.half_day_allowed, false) then errors := errors || jsonb_build_object('code', 'half_day_not_allowed'); end if;
    if p_session is null or p_session not in ('first', 'second') then
      errors := errors || jsonb_build_object('code', 'half_day_session_required');
    end if;
  end if;
  if p_from < today - private.setting_int('leave_backdate_days') then
    errors := errors || jsonb_build_object('code', 'too_far_back', 'days', private.setting_int('leave_backdate_days'));
  end if;
  if p_from < e.date_of_joining then errors := errors || jsonb_build_object('code', 'before_joining'); end if;
  if e.last_working_day is not null and p_to > e.last_working_day then
    errors := errors || jsonb_build_object('code', 'after_last_working_day');
  end if;

  -- Day by day: weekly offs and holidays are never counted (no sandwich rule), except calendar-day types (maternity).
  frac := case when p_half then 0.5 else 1 end;
  for d in select g::date from generate_series(p_from, p_to, interval '1 day') g loop
    select * into o from private.off_day(p_emp, d);
    counts := t.counts_calendar_days or o.reason is null;
    breakdown := breakdown || jsonb_build_object('date', d, 'weekday', to_char(d, 'Dy'), 'counts', counts,
                                                 'reason', o.reason, 'name', o.name);
    if counts then total := total + frac; end if;
  end loop;
  if total = 0 then
    return jsonb_build_object('errors', errors || jsonb_build_object('code', 'no_working_days'), 'breakdown', breakdown, 'days', 0);
  end if;

  select array_agg(x.leave_date::text order by x.leave_date) into overlap_dates
  from public.leave_request_days x
  where x.employee_id = p_emp and x.is_active and x.leave_date between p_from and p_to
    and (t.counts_calendar_days
         or exists (select 1 from jsonb_array_elements(breakdown) b
                     where (b ->> 'date')::date = x.leave_date and (b ->> 'counts')::boolean));
  if overlap_dates is not null then
    errors := errors || jsonb_build_object('code', 'overlap', 'dates', to_jsonb(overlap_dates));
  end if;

  if r.max_days_per_request is not null and total > r.max_days_per_request then
    errors := errors || jsonb_build_object('code', 'exceeds_max_days', 'max', r.max_days_per_request);
  end if;
  if r.min_service_days is not null and (p_from - e.date_of_joining) < r.min_service_days then
    errors := errors || jsonb_build_object('code', 'min_service', 'days', r.min_service_days);
  end if;
  if r.doc_required_over_days is not null and total > r.doc_required_over_days and not p_has_doc then
    errors := errors || jsonb_build_object('code', 'document_required');
  end if;

  -- Balance (LR-8): a full day is never split between paid and LOP; any half-day remainder stays in the balance.
  balance_tracked := t.is_paid and not t.is_event_based and t.code <> 'LOP';
  if balance_tracked then
    for yr in select distinct extract(year from (b ->> 'date')::date)::int
              from jsonb_array_elements(breakdown) b where (b ->> 'counts')::boolean order by 1 loop
      avail := private.leave_available(p_emp, p_type, yr, private.as_of_for(yr));
      pend := private.leave_used(p_emp, p_type, yr, 'pending');
      paid_left := paid_left || jsonb_build_object(yr::text, greatest(avail - pend, 0));
      if first_year is null then first_year := yr; first_avail := avail; first_pend := pend; end if;
    end loop;
  end if;

  for d in select (b ->> 'date')::date from jsonb_array_elements(breakdown) b where (b ->> 'counts')::boolean order by 1 loop
    day_paid := true;
    if balance_tracked then
      yr := extract(year from d)::int;
      if frac <= (paid_left ->> yr::text)::numeric then
        paid_left := paid_left || jsonb_build_object(yr::text, (paid_left ->> yr::text)::numeric - frac);
      else
        day_paid := false; need_conv := true; excess_total := excess_total + frac;
      end if;
    end if;
    if day_paid then paid := paid + frac; else lop := lop + frac; end if;
    day_rows := day_rows || jsonb_build_object('date', d, 'leave_type_id', case when day_paid then p_type else lop_id end,
                                       'fraction', frac, 'is_lop', not day_paid);
  end loop;

  if need_conv and not p_convert then
    errors := errors || jsonb_build_object('code', 'insufficient_balance', 'available', greatest(first_avail - first_pend, 0),
                                           'requested', total, 'excess', excess_total);
  end if;

  return jsonb_build_object(
    'errors', errors, 'days', total, 'paid_days', paid, 'lop_days', lop,
    'breakdown', breakdown, 'day_rows', day_rows, 'needs_conversion', need_conv, 'excess', excess_total,
    'available', first_avail, 'pending', first_pend,
    'balance_after', case when balance_tracked then first_avail - paid else null end,
    'requires_document', r.doc_required_over_days is not null and total > r.doc_required_over_days,
    'lop_type_id', lop_id);
end $$;

-- Preview: the exact rules of apply_leave without writing anything (S8 calculator, agent drafts) --------------
create function public.preview_leave(
  p_type uuid, p_from date, p_to date, p_half boolean default false, p_session text default null,
  p_convert boolean default false, p_has_doc boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); plan jsonb;
begin
  plan := private.leave_plan(a, p_type, p_from, p_to, coalesce(p_half, false), p_session, coalesce(p_convert, false), coalesce(p_has_doc, false));
  return plan || jsonb_build_object('can_submit', jsonb_array_length(plan -> 'errors') = 0);
end $$;

create function public.apply_leave(
  p_type uuid, p_from date, p_to date, p_half boolean, p_session text, p_reason text,
  p_attachment text default null, p_convert boolean default false)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  a uuid := private.require_actor();
  plan jsonb; req_id uuid; drow jsonb; tname text; ename text; rec text;
begin
  perform 1 from public.employees where id = a for update;   -- serialise this employee's requests
  if p_reason is null or length(btrim(p_reason)) < 5 then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array(jsonb_build_object('code', 'reason_required')));
  end if;
  plan := private.leave_plan(a, p_type, p_from, p_to, coalesce(p_half, false), p_session,
                             coalesce(p_convert, false), p_attachment is not null);
  if jsonb_array_length(plan -> 'errors') > 0 then
    return jsonb_build_object('ok', false, 'errors', plan -> 'errors', 'plan', plan);
  end if;

  insert into public.leave_requests(employee_id, leave_type_id, from_date, to_date, is_half_day, half_day_session,
                                    days, lop_days, reason, attachment_path)
  values (a, p_type, p_from, p_to, coalesce(p_half, false), case when p_half then p_session end,
          (plan ->> 'days')::numeric, (plan ->> 'lop_days')::numeric, btrim(p_reason), p_attachment)
  returning id into req_id;

  for drow in select * from jsonb_array_elements(plan -> 'day_rows') loop
    insert into public.leave_request_days(request_id, employee_id, leave_date, leave_type_id, day_fraction)
    values (req_id, a, (drow ->> 'date')::date, (drow ->> 'leave_type_id')::uuid, (drow ->> 'fraction')::numeric);
  end loop;

  select t.name into tname from public.leave_types t where t.id = p_type;
  select e.full_name into ename from public.employees e where e.id = a;
  for rec in select * from private.approver_emails(a) loop
    perform private.queue_email(rec, 'leave_requested',
      jsonb_build_object('employee', ename, 'type', tname, 'from', p_from, 'to', p_to,
                         'days', plan -> 'days', 'reason', btrim(p_reason)), req_id);
  end loop;
  return jsonb_build_object('ok', true, 'id', req_id, 'plan', plan);
end $$;

create function public.decide_leave(p_id uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  a uuid := private.require_actor();
  r public.leave_requests; t public.leave_types; yr integer; need numeric; avail numeric; others numeric;
  emp_email text; tname text;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  perform 1 from public.employees where id = r.employee_id for update;
  if not private.can_decide(r.employee_id) then raise exception 'forbidden'; end if;
  if r.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision'; end if;
  if p_decision = 'reject' and (p_comment is null or btrim(p_comment) = '') then raise exception 'comment_required'; end if;
  select * into t from public.leave_types where id = r.leave_type_id;

  if p_decision = 'approve' then
    -- Re-check the balance at approval time (LR-15): paid days of this request vs balance net of OTHER pending requests.
    if t.is_paid and not t.is_event_based and t.code <> 'LOP' then
      for yr, need in
        select extract(year from d.leave_date)::int, sum(d.day_fraction)
        from public.leave_request_days d
        where d.request_id = r.id and d.is_active and d.leave_type_id = r.leave_type_id group by 1
      loop
        avail := private.leave_available(r.employee_id, r.leave_type_id, yr, private.as_of_for(yr));
        others := private.leave_used(r.employee_id, r.leave_type_id, yr, 'pending') - need;
        if need > avail - others then raise exception 'insufficient_balance'; end if;
      end loop;
    end if;
    update public.leave_requests set status = 'approved', decided_by = a, decided_at = private.clock_now(),
           approver_comment = nullif(btrim(p_comment), '') where id = r.id;
    -- Leave beats an approved WFH day on the same date (AR-7).
    update public.wfh_requests w set status = 'cancelled', decided_comment = 'Superseded by approved leave'
     where w.employee_id = r.employee_id and w.status in ('pending', 'approved')
       and w.work_date in (select d.leave_date from public.leave_request_days d where d.request_id = r.id and d.is_active);
  else
    update public.leave_requests set status = 'rejected', decided_by = a, decided_at = private.clock_now(),
           approver_comment = btrim(p_comment) where id = r.id;
    update public.leave_request_days set is_active = false where request_id = r.id;
  end if;

  select e.email::text into emp_email from public.employees e where e.id = r.employee_id;
  perform private.queue_email(emp_email, 'leave_decided',
    jsonb_build_object('type', t.name, 'from', r.from_date, 'to', r.to_date, 'decision', p_decision,
                       'comment', nullif(btrim(p_comment), '')), r.id);
  return jsonb_build_object('ok', true, 'status', case when p_decision = 'approve' then 'approved' else 'rejected' end);
end $$;

create function public.cancel_leave(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); r public.leave_requests;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if r.id is null or r.employee_id <> a then raise exception 'not_found'; end if;
  if not (r.status = 'pending' or (r.status = 'approved' and r.from_date > private.today_ist())) then
    raise exception 'cannot_cancel';
  end if;
  update public.leave_requests set status = 'cancelled', cancelled_at = private.clock_now() where id = r.id;
  update public.leave_request_days set is_active = false where request_id = r.id;
  return jsonb_build_object('ok', true);
end $$;

create function public.hr_adjust_leave(p_emp uuid, p_type uuid, p_year integer, p_days numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr(); new_id uuid;
begin
  perform set_config('app.audit_reason', p_reason, true);
  insert into public.leave_adjustments(employee_id, leave_type_id, year, days, reason, created_by)
  values (p_emp, p_type, p_year, p_days, p_reason, a) returning id into new_id;
  return new_id;
end $$;

-- LR-11 / LR-20: when a date becomes an off day for someone (new holiday, weekly-off change, approved optional
-- holiday), their leave on that date is released and the balance restored automatically (balances are derived).
create function private.release_conflicting_leave(p_from date) returns integer
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare rec record; req record; released integer := 0; remaining numeric; emp_email text;
begin
  for rec in
    select d.id, d.request_id, d.employee_id, d.leave_date
    from public.leave_request_days d
    join public.leave_requests q on q.id = d.request_id
    join public.leave_types t on t.id = q.leave_type_id
    where d.is_active and d.leave_date >= p_from and not t.counts_calendar_days
      and (select o.reason from private.off_day(d.employee_id, d.leave_date) o) is not null
  loop
    update public.leave_request_days set is_active = false where id = rec.id;
    released := released + 1;
  end loop;

  for req in
    select distinct q.id, q.employee_id from public.leave_requests q
    join public.leave_request_days d on d.request_id = q.id
    where q.status in ('pending', 'approved') and d.leave_date >= p_from
      and not exists (select 1 from public.leave_request_days a where a.request_id = q.id and a.is_active)
  loop
    update public.leave_requests set status = 'cancelled', cancelled_at = private.clock_now() where id = req.id;
    select e.email::text into emp_email from public.employees e where e.id = req.employee_id;
    perform private.queue_email(emp_email, 'leave_released', jsonb_build_object('reason', 'A holiday or weekly off now covers all your leave days'), req.id);
  end loop;

  for req in
    select q.id, q.employee_id from public.leave_requests q
    where q.status in ('pending', 'approved')
      and exists (select 1 from public.leave_request_days d where d.request_id = q.id and not d.is_active and d.leave_date >= p_from)
      and exists (select 1 from public.leave_request_days a where a.request_id = q.id and a.is_active)
  loop
    select coalesce(sum(a.day_fraction), 0) into remaining from public.leave_request_days a where a.request_id = req.id and a.is_active;
    update public.leave_requests q set days = remaining,
      lop_days = coalesce((select sum(a.day_fraction) from public.leave_request_days a
                            join public.leave_types lt on lt.id = a.leave_type_id
                           where a.request_id = q.id and a.is_active and lt.code = 'LOP'), 0)
    where q.id = req.id;
  end loop;
  return released;
end $$;

grant execute on function
  private.queue_email(text, text, jsonb, uuid), private.approver_emails(uuid),
  private.leave_plan(uuid, uuid, date, date, boolean, text, boolean, boolean),
  private.release_conflicting_leave(date)
  to authenticated, app_runtime;
grant execute on function
  public.preview_leave(uuid, date, date, boolean, text, boolean, boolean),
  public.apply_leave(uuid, date, date, boolean, text, text, text, boolean),
  public.decide_leave(uuid, text, text), public.cancel_leave(uuid),
  public.hr_adjust_leave(uuid, uuid, integer, numeric, text)
  to authenticated;
