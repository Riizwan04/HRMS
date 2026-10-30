-- 0009_app_reads: read functions for the app screens (own data only; the browser never selects tables directly).
-- Every function filters by the caller's identity inside, because SECURITY DEFINER bypasses RLS.

-- My leave history for a year, with the decider's name (employees' rows are not readable by their own reports).
create function public.my_leave_history(p_year integer)
returns table (id uuid, type_code text, type_name text, from_date date, to_date date, days numeric, lop_days numeric,
               status text, approver_comment text, decided_by_name text, has_attachment boolean, is_half_day boolean, created_at timestamptz)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select r.id, t.code, t.name, r.from_date, r.to_date, r.days, r.lop_days, r.status::text, r.approver_comment,
         d.full_name, r.attachment_path is not null, r.is_half_day, r.created_at
  from public.leave_requests r
  join public.leave_types t on t.id = r.leave_type_id
  left join public.employees d on d.id = r.decided_by
  where private.actor_id() is not null and r.employee_id = private.actor_id()
    and extract(year from r.from_date)::int = p_year
  order by r.from_date desc, r.created_at desc
$$;

-- Loss-of-pay days taken in a year (approved leave days of type LOP, including converted excess).
create function public.my_lop_taken(p_year integer) returns numeric
language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce(sum(d.day_fraction), 0)
  from public.leave_request_days d
  join public.leave_requests r on r.id = d.request_id
  join public.leave_types t on t.id = d.leave_type_id
  where private.actor_id() is not null and d.employee_id = private.actor_id() and d.is_active
    and r.status = 'approved' and t.code = 'LOP' and extract(year from d.leave_date)::int = p_year
$$;

-- Leave types the caller may apply for (gender rule), with the half-day flag and certificate threshold of the rule in force.
create function public.my_leave_types(p_year integer)
returns table (id uuid, code text, name text, half_day_allowed boolean, doc_required_over_days integer, is_event_based boolean)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select t.id, t.code, t.name, coalesce(r.half_day_allowed, false), r.doc_required_over_days, t.is_event_based
  from public.leave_types t
  join public.employees e on e.id = private.actor_id()
  left join lateral (select * from public.leave_type_rules x where x.leave_type_id = t.id and x.effective_from_year <= p_year
                     order by x.effective_from_year desc limit 1) r on true
  where t.is_active and (t.applicable_gender = 'any' or t.applicable_gender::text = e.gender::text)
  order by case t.code when 'CL' then 1 when 'SL' then 2 when 'EL' then 3 else 9 end, t.code
$$;

revoke all on function public.my_leave_history(integer), public.my_lop_taken(integer), public.my_leave_types(integer) from public;
grant execute on function public.my_leave_history(integer), public.my_lop_taken(integer), public.my_leave_types(integer) to authenticated;
