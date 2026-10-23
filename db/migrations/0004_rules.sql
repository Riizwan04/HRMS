-- 0004_rules: read-only business rules, the single implementation used by screens, CSV and agent.
-- Working days (LR-6, LR-10, LR-20), leave balance (LR-2..LR-5), day status (AR-4..AR-10), month summary (LR-18).

-- Where was the employee on a given date? (history-aware, so transfers never rewrite the past) ---------
create function private.location_on(emp uuid, d date) returns uuid
language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(
    (select h.location_id from public.employee_location_history h
      where h.employee_id = emp and h.effective_from <= d order by h.effective_from desc limit 1),
    (select e.location_id from public.employees e where e.id = emp))
$$;

create function private.weekly_offs_on(loc uuid, d date) returns smallint[]
language sql stable security definer set search_path = public, private, pg_temp as $$
  select w.weekly_off_days from public.location_weekly_offs w
  where w.location_id = loc and w.effective_from <= d
  order by w.effective_from desc limit 1
$$;

-- Why is this date not a working day for this employee? Weekly off wins over a holiday (LR-10).
create function private.off_day(emp uuid, d date, out reason text, out name text)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  loc uuid := private.location_on(emp, d);
  wo smallint[] := private.weekly_offs_on(loc, d);
begin
  if wo is not null and extract(isodow from d)::smallint = any (wo) then
    reason := 'weekly_off'; return;
  end if;
  select h.name into name from public.holidays h
   where h.location_id = loc and h.holiday_date = d and h.type in ('national', 'state') limit 1;
  if found then reason := 'holiday'; return; end if;
  select h.name into name from public.optional_holiday_requests r
    join public.holidays h on h.id = r.holiday_id
   where r.employee_id = emp and r.status = 'approved' and h.holiday_date = d limit 1;
  if found then reason := 'optional_holiday'; return; end if;
  name := null; reason := null;
end $$;

create function public.count_working_days(p_emp uuid, p_from date, p_to date, p_calendar boolean default false)
returns table (day date, counts boolean, reason text, name text)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
begin
  if not private.can_view_employee(p_emp) then raise exception 'forbidden'; end if;
  if p_to < p_from then raise exception 'invalid_range'; end if;
  if p_to - p_from > 400 then raise exception 'range_too_large'; end if;
  return query
    select g::date, (p_calendar or o.reason is null), o.reason, o.name
    from generate_series(p_from, p_to, interval '1 day') g
    cross join lateral private.off_day(p_emp, g::date) o
    order by 1;
end $$;

-- Leave rules and balances ------------------------------------------------------------------------
create function private.rule_for(p_type uuid, p_year integer) returns public.leave_type_rules
language sql stable security definer set search_path = public, private, pg_temp as $$
  select r.* from public.leave_type_rules r
  where r.leave_type_id = p_type and r.effective_from_year <= p_year
  order by r.effective_from_year desc limit 1
$$;

-- Pro-rating for joiners (LR-3): months counted from the joining month (only if joined on/before the 15th),
-- quota * months / 12, rounded to the nearest 0.5 with exact quarters rounding up.
create function private.prorated(quota numeric, doj date) returns numeric
language sql immutable as $$
  select floor((quota * (13 - extract(month from doj)::int - case when extract(day from doj) > 15 then 1 else 0 end) / 12.0) * 2 + 0.5) / 2
$$;

-- Which date a year's balance is evaluated at (OQ-10).
create function private.as_of_for(p_year integer) returns date
language sql stable as $$
  select case
    when p_year < extract(year from private.today_ist())::int then make_date(p_year + 1, 1, 1)
    when p_year = extract(year from private.today_ist())::int then private.today_ist()
    else make_date(p_year, 1, 1) end
$$;

create function private.leave_accrued(emp uuid, p_type uuid, p_year integer, as_of date) returns numeric
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  r public.leave_type_rules;
  doj date; lwd date; st date; eff date; m integer;
begin
  select e.date_of_joining, e.last_working_day into doj, lwd from public.employees e where e.id = emp;
  r := private.rule_for(p_type, p_year);
  if r is null or doj is null then return 0; end if;
  if extract(year from doj)::int > p_year then return 0; end if;
  if r.accrual_method = 'upfront_prorated' then
    if extract(year from doj)::int = p_year then
      return private.prorated(r.annual_quota, doj);
    end if;
    return r.annual_quota;
  elsif r.accrual_method = 'monthly' then
    st := greatest(doj, make_date(p_year, 1, 1));
    eff := least(as_of, make_date(p_year + 1, 1, 1));
    if lwd is not null then eff := least(eff, lwd + 1); end if;
    if eff <= st then return 0; end if;
    m := (extract(year from age(eff, st)) * 12 + extract(month from age(eff, st)))::int;
    return m * r.accrual_per_month;
  end if;
  return 0;
end $$;

create function private.leave_used(emp uuid, p_type uuid, p_year integer, st public.req_status_t) returns numeric
language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(sum(d.day_fraction), 0)
  from public.leave_request_days d
  join public.leave_requests r on r.id = d.request_id
  where d.employee_id = emp and d.leave_type_id = p_type and d.is_active
    and r.status = st and extract(year from d.leave_date)::int = p_year
$$;

create function private.leave_adjusted(emp uuid, p_type uuid, p_year integer) returns numeric
language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(sum(a.days), 0) from public.leave_adjustments a
  where a.employee_id = emp and a.leave_type_id = p_type and a.year = p_year
$$;

-- Opening balance = carry-forward from last year's closing (capped, LR-4/LR-5) + any go-live import.
create function private.leave_opening(emp uuid, p_type uuid, p_year integer) returns numeric
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  r public.leave_type_rules; doj date; carry numeric := 0; imported numeric;
begin
  select e.date_of_joining into doj from public.employees e where e.id = emp;
  r := private.rule_for(p_type, p_year);
  if r is not null and r.carry_forward_max is not null and r.carry_forward_max > 0
     and p_year - 1 >= extract(year from doj)::int then
    carry := least(r.carry_forward_max, greatest(private.leave_closing(emp, p_type, p_year - 1), 0));
  end if;
  select o.days into imported from public.leave_opening_balances o
   where o.employee_id = emp and o.leave_type_id = p_type and o.year = p_year;
  return carry + coalesce(imported, 0);
end $$;

create function private.leave_closing(emp uuid, p_type uuid, p_year integer) returns numeric
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.leave_opening(emp, p_type, p_year)
       + private.leave_accrued(emp, p_type, p_year, make_date(p_year + 1, 1, 1))
       + private.leave_adjusted(emp, p_type, p_year)
       - private.leave_used(emp, p_type, p_year, 'approved')
$$;

create function private.leave_available(emp uuid, p_type uuid, p_year integer, as_of date) returns numeric
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.leave_opening(emp, p_type, p_year)
       + private.leave_accrued(emp, p_type, p_year, as_of)
       + private.leave_adjusted(emp, p_type, p_year)
       - private.leave_used(emp, p_type, p_year, 'approved')
$$;

create function public.leave_balances(p_emp uuid, p_year integer)
returns table (leave_type_id uuid, code text, name text, opening numeric, accrued numeric,
               adjusted numeric, used numeric, pending numeric, available numeric)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare as_of date := private.as_of_for(p_year); g public.gender_t;
begin
  if not private.can_view_employee(p_emp) then raise exception 'forbidden'; end if;
  select e.gender into g from public.employees e where e.id = p_emp;
  return query
    select t.id, t.code, t.name,
           private.leave_opening(p_emp, t.id, p_year),
           private.leave_accrued(p_emp, t.id, p_year, as_of),
           private.leave_adjusted(p_emp, t.id, p_year),
           private.leave_used(p_emp, t.id, p_year, 'approved'),
           private.leave_used(p_emp, t.id, p_year, 'pending'),
           private.leave_available(p_emp, t.id, p_year, as_of)
    from public.leave_types t
    where t.is_active and not t.is_event_based
      and (t.applicable_gender = 'any' or t.applicable_gender::text = g::text)
    order by t.code;
end $$;

-- Day status (AR-1..AR-10): one row per calendar day, computed on read, never stored ---------------------
create function public.day_status(p_emp uuid, p_from date, p_to date)
returns table (
  day date, status text, is_wfh boolean, is_late boolean, worked_minutes integer, missing_checkout boolean,
  check_in timestamptz, check_out timestamptz, leave_fraction numeric, leave_type_code text,
  present_fraction numeric, lop_fraction numeric, off_reason text, off_name text)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  e public.employees;
  today date := private.today_ist();
  cutoff time := private.setting('late_cutoff_time')::time;
  present_min integer := private.setting_int('present_min_minutes');
  half_min integer := private.setting_int('half_day_min_minutes');
begin
  if not private.can_view_employee(p_emp) then raise exception 'forbidden'; end if;
  if p_to < p_from then raise exception 'invalid_range'; end if;
  if p_to - p_from > 400 then raise exception 'range_too_large'; end if;
  select * into e from public.employees x where x.id = p_emp;

  return query
  with days as (
    select g::date as d from generate_series(p_from, p_to, interval '1 day') g
  ), raw as (
    select
      d.d as day,
      (d.d >= e.date_of_joining and (e.last_working_day is null or d.d <= e.last_working_day)) as employed,
      coalesce((select sum(x.day_fraction) from public.leave_request_days x
                 join public.leave_requests r on r.id = x.request_id
                where x.employee_id = p_emp and x.leave_date = d.d and x.is_active and r.status = 'approved'), 0) as lf,
      (select lt.code from public.leave_request_days x
         join public.leave_requests r on r.id = x.request_id
         join public.leave_types lt on lt.id = x.leave_type_id
        where x.employee_id = p_emp and x.leave_date = d.d and x.is_active and r.status = 'approved' limit 1) as lcode,
      o.reason as off_reason, o.name as off_name,
      exists (select 1 from public.wfh_requests w
               where w.employee_id = p_emp and w.work_date = d.d and w.status = 'approved') as wfh,
      a.check_in as a_in, a.check_out as a_out, (a.id is not null) as has_att
    from days d
    cross join lateral private.off_day(p_emp, d.d) o
    left join public.attendance a on a.employee_id = p_emp and a.work_date = d.d
  ), calc as (
    select r.*,
      case when r.a_out is not null then (extract(epoch from (r.a_out - r.a_in)) / 60)::integer end as mins
    from raw r
  ), st as (
    select c.*,
      case
        when not c.employed then 'not_employed'
        when c.lf >= 1 then 'on_leave'
        when c.off_reason = 'weekly_off' then 'weekly_off'
        when c.off_reason in ('holiday', 'optional_holiday') then 'holiday'
        when c.wfh then 'present'
        when not c.has_att then case when c.day > today then 'future' when c.day = today then 'pending' else 'absent' end
        when c.a_out is null then case when c.day >= today then 'in_progress' else 'absent' end
        when c.lf = 0.5 then case when c.mins >= half_min then 'present' else 'absent' end
        when c.mins >= present_min then 'present'
        when c.mins >= half_min then 'half_day'
        else 'absent'
      end as s
    from calc c
  )
  select
    s.day,
    s.s,
    (s.wfh and s.s = 'present'),
    (s.employed and s.has_att and not s.wfh and s.lf < 1
       and s.s in ('present', 'half_day', 'absent', 'in_progress')
       and (s.a_in at time zone 'Asia/Kolkata')::time > cutoff),
    s.mins,
    (s.employed and s.has_att and s.a_out is null and s.day < today and s.s = 'absent'),
    s.a_in, s.a_out,
    case when s.employed then s.lf else 0 end,
    case when s.employed and s.lf > 0 then s.lcode end,
    case
      when s.s = 'present' and s.wfh then 1 - s.lf
      when s.s = 'present' then case when s.lf = 0.5 then 0.5 else 1 end
      when s.s = 'half_day' then 0.5
      else 0 end,
    case
      when s.s = 'half_day' then 0.5
      when s.s = 'absent' then 1 - s.lf
      else 0 end,
    case when s.employed then s.off_reason end,
    case when s.employed then s.off_name end
  from st s
  order by s.day;
end $$;

-- Month summary (LR-18). Scope: HR sees everyone (optional filters); managers only their direct reports. ------
create function public.month_summary(p_month date, p_location uuid default null, p_department uuid default null)
returns table (
  employee_id uuid, employee_code text, full_name text, location_name text, days_employed integer,
  present_days numeric, wfh_days numeric, cl numeric, sl numeric, el numeric, ml numeric, pl numeric,
  lop_days numeric, holidays integer, weekly_offs integer, late_marks integer)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare
  ms date := date_trunc('month', p_month)::date;
  me date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  hr boolean := private.is_hr_admin();
  per integer := private.setting_int('late_marks_per_half_day');
  rec record; agg record; late_lop numeric; pres numeric;
begin
  if private.actor_id() is null then raise exception 'not_authenticated'; end if;
  if not hr and not private.is_manager() then raise exception 'forbidden'; end if;

  for rec in
    select e.id, e.employee_code, e.full_name, e.date_of_joining, e.last_working_day
    from public.employees e
    where e.date_of_joining <= me and (e.last_working_day is null or e.last_working_day >= ms)
      and (hr or e.reporting_manager_id = private.actor_id())
      and (p_department is null or e.department_id = p_department)
      and (p_location is null or private.location_on(e.id, me) = p_location)
    order by e.employee_code
  loop
    select
      count(*) filter (where s.status <> 'not_employed')::int as de,
      coalesce(sum(case when s.is_wfh then 0 else s.present_fraction end), 0) as pr,
      coalesce(sum(case when s.is_wfh then s.present_fraction else 0 end), 0) as wf,
      coalesce(sum(s.leave_fraction) filter (where s.leave_type_code = 'CL'), 0) as cl,
      coalesce(sum(s.leave_fraction) filter (where s.leave_type_code = 'SL'), 0) as sl,
      coalesce(sum(s.leave_fraction) filter (where s.leave_type_code = 'EL'), 0) as el,
      coalesce(sum(s.leave_fraction) filter (where s.leave_type_code = 'ML'), 0) as ml,
      coalesce(sum(s.leave_fraction) filter (where s.leave_type_code = 'PL'), 0) as pl,
      coalesce(sum(s.lop_fraction), 0) + coalesce(sum(s.leave_fraction) filter (where s.leave_type_code = 'LOP'), 0) as lop,
      count(*) filter (where s.status = 'holiday')::int as hol,
      count(*) filter (where s.status = 'weekly_off')::int as wo,
      count(*) filter (where s.is_late)::int as late
    into agg
    from public.day_status(rec.id, greatest(ms, rec.date_of_joining), me) s;

    pres := agg.pr;
    late_lop := least(floor(agg.late::numeric / per) * 0.5, pres);
    employee_id := rec.id; employee_code := rec.employee_code; full_name := rec.full_name;
    location_name := (select l.name from public.locations l where l.id = private.location_on(rec.id, me));
    days_employed := agg.de;
    present_days := pres - late_lop;
    wfh_days := agg.wf;
    cl := agg.cl; sl := agg.sl; el := agg.el; ml := agg.ml; pl := agg.pl;
    lop_days := agg.lop + late_lop;
    holidays := agg.hol; weekly_offs := agg.wo; late_marks := agg.late;
    return next;
  end loop;
end $$;

grant execute on function
  private.location_on(uuid, date), private.weekly_offs_on(uuid, date), private.off_day(uuid, date),
  private.rule_for(uuid, integer), private.prorated(numeric, date), private.as_of_for(integer),
  private.leave_accrued(uuid, uuid, integer, date), private.leave_used(uuid, uuid, integer, public.req_status_t),
  private.leave_adjusted(uuid, uuid, integer), private.leave_opening(uuid, uuid, integer),
  private.leave_closing(uuid, uuid, integer), private.leave_available(uuid, uuid, integer, date)
  to authenticated, app_runtime;

grant execute on function
  public.count_working_days(uuid, date, date, boolean), public.leave_balances(uuid, integer),
  public.day_status(uuid, date, date), public.month_summary(date, uuid, uuid)
  to authenticated;
