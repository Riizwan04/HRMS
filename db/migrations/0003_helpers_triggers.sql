-- 0003_helpers_triggers: identity helpers, integrity triggers, audit trail.
-- All SECURITY DEFINER functions run with owner rights and therefore always filter by the caller themselves.

-- Identity ---------------------------------------------------------------------
create function private.auth_sub() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
$$;

-- The acting employee: linked Clerk user, active, not past their last working day (DV-12).
create function private.actor_id() returns uuid
language sql stable security definer set search_path = public, private, pg_temp as $$
  select e.id from public.employees e
  where e.clerk_user_id is not null
    and e.clerk_user_id = private.auth_sub()
    and e.status = 'active'
    and (e.last_working_day is null or e.last_working_day >= private.today_ist())
$$;

create function private.is_hr_admin() returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select coalesce((select e.is_hr_admin from public.employees e where e.id = private.actor_id()), false)
$$;

create function private.is_manager_of(emp uuid) returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists (
    select 1 from public.employees e
    where e.id = emp and e.reporting_manager_id is not null and e.reporting_manager_id = private.actor_id()
  )
$$;

create function private.is_manager() returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists (
    select 1 from public.employees e
    where e.reporting_manager_id = private.actor_id() and e.status = 'active'
  )
$$;

-- Same-person-or-HR-or-their-manager visibility rule used by RLS and RPCs.
create function private.can_view_employee(emp uuid) returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.actor_id() is not null
     and (emp = private.actor_id() or private.is_hr_admin() or private.is_manager_of(emp))
$$;

-- LR-21: decided only by the requester's current manager or an HR admin, never by the requester.
create function private.can_decide(requester uuid) returns boolean
language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.actor_id() is not null
     and requester <> private.actor_id()
     and (private.is_hr_admin() or private.is_manager_of(requester))
$$;

create function private.require_actor() returns uuid
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.actor_id();
begin
  if a is null then raise exception 'not_authenticated'; end if;
  return a;
end $$;

create function private.require_hr() returns uuid
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor();
begin
  if not private.is_hr_admin() then raise exception 'forbidden'; end if;
  return a;
end $$;

grant execute on function
  private.auth_sub(), private.actor_id(), private.is_hr_admin(), private.is_manager_of(uuid),
  private.is_manager(), private.can_view_employee(uuid), private.can_decide(uuid),
  private.require_actor(), private.require_hr()
  to authenticated, app_runtime;

-- Masking ------------------------------------------------------------------------
create function private.mask_pan(p text) returns text language sql immutable as $$
  select case when p is null then null else left(p, 5) || '****' || right(p, 1) end
$$;
create function private.mask_account(a text) returns text language sql immutable as $$
  select case when a is null then null else repeat('•', 8) || ' ' || right(a, 4) end
$$;
create function private.mask_aadhaar(last4 text) returns text language sql immutable as $$
  select case when last4 is null then null else 'XXXX XXXX ' || last4 end
$$;
grant execute on function private.mask_pan(text), private.mask_account(text), private.mask_aadhaar(text)
  to authenticated, app_runtime;

-- Audit trail (append-only; sensitive values stored masked) ---------------------------
create function private.audit_changes() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare
  category text := tg_argv[0];
  k text; o jsonb; n jsonb; ov text; nv text; rid uuid; act public.audit_action_t;
  rsn text := nullif(current_setting('app.audit_reason', true), '');
begin
  o := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  n := to_jsonb(new);
  rid := coalesce(n ->> 'id', n ->> 'employee_id', n ->> 'location_id', n ->> 'leave_type_id')::uuid;
  act := case
           when category = 'config' then 'config'
           when nullif(current_setting('app.audit_action', true), '') = 'correction' then 'correction'
           when tg_op = 'INSERT' then 'insert'
           else 'update' end;
  for i in 1 .. coalesce(array_length(tg_argv, 1), 1) - 1 loop
    k := tg_argv[i];
    ov := o ->> k; nv := n ->> k;
    if tg_op = 'UPDATE' and ov is not distinct from nv then continue; end if;
    if tg_op = 'INSERT' and nv is null then continue; end if;
    if k = 'pan' then ov := private.mask_pan(ov); nv := private.mask_pan(nv);
    elsif k = 'account_number' then ov := private.mask_account(ov); nv := private.mask_account(nv);
    elsif k = 'aadhaar_last4' then ov := private.mask_aadhaar(ov); nv := private.mask_aadhaar(nv);
    elsif k = 'aadhaar_ciphertext' then
      ov := case when ov is null then null else '[encrypted]' end; nv := '[replaced]';
    end if;
    insert into public.audit_log(table_name, record_id, field, old_value, new_value, action, changed_by, changed_at, reason)
    values (tg_table_name, rid, k, ov, nv, act, private.actor_id(), private.clock_now(), rsn);
  end loop;
  return null;
end $$;

create function private.audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_immutable();

create trigger aud_employees after insert or update on public.employees
  for each row execute function private.audit_changes('data',
    'full_name','email','dob','gender','date_of_joining','last_working_day','designation','salary_grade',
    'location_id','department_id','reporting_manager_id','is_hr_admin','status');
create trigger aud_statutory after insert or update on public.employee_statutory
  for each row execute function private.audit_changes('data', 'pan', 'uan', 'aadhaar_last4', 'aadhaar_ciphertext');
create trigger aud_bank after insert or update on public.employee_bank
  for each row execute function private.audit_changes('data', 'account_number', 'ifsc', 'bank_name');
create trigger aud_contact after insert or update on public.employee_contact
  for each row execute function private.audit_changes('data', 'mobile', 'address_line1', 'address_line2', 'city', 'state_code', 'pin_code', 'ec_name', 'ec_relationship', 'ec_mobile');
create trigger aud_locations after insert or update on public.locations
  for each row execute function private.audit_changes('config', 'name', 'city', 'state_code', 'is_active');
create trigger aud_weekly_offs after insert or update on public.location_weekly_offs
  for each row execute function private.audit_changes('config', 'effective_from', 'weekly_off_days');
create trigger aud_departments after insert or update on public.departments
  for each row execute function private.audit_changes('config', 'name', 'is_active');
create trigger aud_leave_rules after insert or update on public.leave_type_rules
  for each row execute function private.audit_changes('config', 'effective_from_year', 'annual_quota', 'accrual_method', 'accrual_per_month', 'carry_forward_max', 'half_day_allowed', 'doc_required_over_days', 'max_days_per_request', 'must_be_continuous', 'min_service_days');
create trigger aud_leave_adjust after insert on public.leave_adjustments
  for each row execute function private.audit_changes('data', 'employee_id', 'leave_type_id', 'year', 'days');
create trigger aud_attendance after insert or update on public.attendance
  for each row execute function private.audit_changes('data', 'check_in', 'check_out', 'source');
-- DELETE on holidays needs its own trigger (NEW is null on delete).
create trigger aud_holidays after insert or update on public.holidays
  for each row execute function private.audit_changes('config', 'holiday_date', 'name', 'type', 'location_id');
create function private.audit_holiday_delete() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  insert into public.audit_log(table_name, record_id, field, old_value, new_value, action, changed_by, changed_at, reason)
  values ('holidays', old.id, 'deleted', old.holiday_date::text || ' ' || old.name, null, 'config', private.actor_id(), private.clock_now(),
          nullif(current_setting('app.audit_reason', true), ''));
  return old;
end $$;
create trigger aud_holidays_del before delete on public.holidays
  for each row execute function private.audit_holiday_delete();

-- Employee integrity (DV-9, DV-10, DV-11) -----------------------------------------------
create function private.employees_guard() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    if new.employee_code is distinct from old.employee_code then
      raise exception 'employee_code_immutable';
    end if;
  end if;

  if new.reporting_manager_id is not null
     and (tg_op = 'INSERT' or new.reporting_manager_id is distinct from old.reporting_manager_id) then
    if not exists (select 1 from public.employees where id = new.reporting_manager_id and status = 'active') then
      raise exception 'manager_inactive';
    end if;
    if exists (
      with recursive up as (
        select id, reporting_manager_id from public.employees where id = new.reporting_manager_id
        union all
        select e.id, e.reporting_manager_id from public.employees e join up on e.id = up.reporting_manager_id
      ) select 1 from up where id = new.id
    ) then
      raise exception 'manager_cycle';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'inactive' and old.status = 'active'
       and exists (select 1 from public.employees r where r.reporting_manager_id = new.id and r.status = 'active') then
      raise exception 'has_active_reports';
    end if;
    if old.is_hr_admin and old.status = 'active' and (not new.is_hr_admin or new.status <> 'active')
       and not exists (select 1 from public.employees h where h.id <> new.id and h.is_hr_admin and h.status = 'active') then
      raise exception 'last_hr_admin';
    end if;
  end if;
  return new;
end $$;
create trigger employees_guard_trg before insert or update on public.employees
  for each row execute function private.employees_guard();

create function private.employees_after_insert() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  insert into public.employee_location_history(employee_id, effective_from, location_id)
  values (new.id, new.date_of_joining, new.location_id)
  on conflict do nothing;
  return null;
end $$;
create trigger employees_after_insert_trg after insert on public.employees
  for each row execute function private.employees_after_insert();

-- Attendance: the day is the IST date of check-in; never client supplied (AR-1, AR-2) ------
create function private.attendance_work_date() returns trigger language plpgsql as $$
begin
  new.work_date := (new.check_in at time zone 'Asia/Kolkata')::date;
  return new;
end $$;
create trigger attendance_work_date_trg before insert or update of check_in on public.attendance
  for each row execute function private.attendance_work_date();

-- is_active mirrors the request status (pending or approved) -----------------------------
create function private.leave_days_consistency() returns trigger
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare st public.req_status_t;
begin
  select status into st from public.leave_requests where id = new.request_id;
  if new.is_active and st not in ('pending', 'approved') then
    raise exception 'leave_day_inconsistent';
  end if;
  return new;
end $$;
create trigger leave_days_consistency_trg before insert or update on public.leave_request_days
  for each row execute function private.leave_days_consistency();

grant execute on function private.audit_changes(), private.audit_holiday_delete(), private.employees_guard(),
  private.employees_after_insert(), private.attendance_work_date(), private.leave_days_consistency()
  to authenticated, app_runtime;
