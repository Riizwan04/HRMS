-- 0010_decisions: the "Decided" tab of the approvals inbox: requests the caller approved or rejected, newest first.
create function public.my_decisions(p_limit integer default 30)
returns table (kind text, id uuid, employee_code text, employee_name text, label text, outcome text, comment text, decided_at timestamptz)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select * from (
    select 'leave'::text, r.id, e.employee_code, e.full_name,
           t.code || ' ' || to_char(r.from_date, 'DD Mon') || case when r.to_date <> r.from_date then ' - ' || to_char(r.to_date, 'DD Mon') else '' end,
           r.status::text, r.approver_comment, r.decided_at
      from public.leave_requests r join public.employees e on e.id = r.employee_id join public.leave_types t on t.id = r.leave_type_id
     where r.decided_by = private.actor_id() and r.status in ('approved', 'rejected')
    union all
    select 'regularisation', g.id, e.employee_code, e.full_name, 'Regularisation ' || to_char(g.work_date, 'DD Mon'),
           g.status::text, g.decided_comment, g.decided_at
      from public.regularisation_requests g join public.employees e on e.id = g.employee_id
     where g.decided_by = private.actor_id() and g.status in ('approved', 'rejected')
    union all
    select 'wfh', w.id, e.employee_code, e.full_name, 'WFH ' || to_char(w.work_date, 'DD Mon'),
           w.status::text, w.decided_comment, w.decided_at
      from public.wfh_requests w join public.employees e on e.id = w.employee_id
     where w.decided_by = private.actor_id() and w.status in ('approved', 'rejected')
    union all
    select 'optional_holiday', o.id, e.employee_code, e.full_name, 'Optional holiday ' || h.name,
           o.status::text, o.decided_comment, o.decided_at
      from public.optional_holiday_requests o join public.employees e on e.id = o.employee_id join public.holidays h on h.id = o.holiday_id
     where o.decided_by = private.actor_id() and o.status in ('approved', 'rejected')
  ) d(kind, id, employee_code, employee_name, label, outcome, comment, decided_at)
  where private.actor_id() is not null
  order by decided_at desc nulls last
  limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.my_decisions(integer) from public;
grant execute on function public.my_decisions(integer) to authenticated;
