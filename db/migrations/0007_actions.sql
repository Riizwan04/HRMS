-- 0007_actions: attendance, WFH, optional holidays, regularisation, employees, configuration, reports,
-- agent drafts and the narrow system functions only app_runtime may execute.

-- Attendance -----------------------------------------------------------------------------------------------
create function public.check_in() returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); n integer; row jsonb;
begin
  insert into public.attendance(employee_id, check_in) values (a, private.clock_now())
  on conflict on constraint uq_attendance_day do nothing;
  get diagnostics n = row_count;
  select to_jsonb(x) into row from public.attendance x where x.employee_id = a and x.work_date = private.today_ist();
  return jsonb_build_object('created', n = 1, 'attendance', row);
end $$;

create function public.check_out() returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); att public.attendance;
begin
  update public.attendance set check_out = private.clock_now()
   where employee_id = a and check_out is null and check_in > private.clock_now() - interval '24 hours'
     and check_in < private.clock_now()
  returning * into att;
  if att.id is null then
    select * into att from public.attendance x where x.employee_id = a and x.work_date = private.today_ist() and x.check_out is not null;
    if att.id is null then raise exception 'no_check_in'; end if;
    return jsonb_build_object('updated', false, 'attendance', to_jsonb(att));
  end if;
  return jsonb_build_object('updated', true, 'attendance', to_jsonb(att));
end $$;

-- WFH (AR-7) -------------------------------------------------------------------------------------------------
create function public.request_wfh(p_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); e public.employees; o record; new_id uuid;
begin
  select * into e from public.employees where id = a;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'reason_required'; end if;
  if p_date < private.today_ist() then raise exception 'date_in_past'; end if;
  if p_date < e.date_of_joining or (e.last_working_day is not null and p_date > e.last_working_day) then raise exception 'not_employed'; end if;
  select * into o from private.off_day(a, p_date);
  if o.reason is not null then raise exception 'not_working_day'; end if;
  if exists (select 1 from public.leave_request_days d join public.leave_requests r on r.id = d.request_id
              where d.employee_id = a and d.leave_date = p_date and d.is_active and r.status = 'approved') then
    raise exception 'on_leave';
  end if;
  begin
    insert into public.wfh_requests(employee_id, work_date, reason) values (a, p_date, btrim(p_reason)) returning id into new_id;
  exception when unique_violation then raise exception 'duplicate_request';
  end;
  return new_id;
end $$;

create function public.decide_wfh(p_id uuid, p_decision text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); r public.wfh_requests;
begin
  select * into r from public.wfh_requests where id = p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  if not private.can_decide(r.employee_id) then raise exception 'forbidden'; end if;
  if r.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision'; end if;
  if p_decision = 'reject' and (p_comment is null or btrim(p_comment) = '') then raise exception 'comment_required'; end if;
  if p_decision = 'approve' and exists (
       select 1 from public.leave_request_days d join public.leave_requests q on q.id = d.request_id
        where d.employee_id = r.employee_id and d.leave_date = r.work_date and d.is_active and q.status = 'approved') then
    raise exception 'on_leave';
  end if;
  update public.wfh_requests set status = case when p_decision = 'approve' then 'approved' else 'rejected' end::public.req_status_t,
         decided_by = a, decided_at = private.clock_now(), decided_comment = nullif(btrim(p_comment), '') where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- Optional holidays (LR-20) ---------------------------------------------------------------------------------------
create function public.request_optional_holiday(p_holiday uuid) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); h public.holidays; used integer; new_id uuid; yr integer;
begin
  perform 1 from public.employees where id = a for update;    -- makes the yearly cap race-free
  select * into h from public.holidays where id = p_holiday;
  if h.id is null or h.type <> 'optional' then raise exception 'not_optional_holiday'; end if;
  if private.location_on(a, h.holiday_date) <> h.location_id then raise exception 'wrong_location'; end if;
  if h.holiday_date <= private.today_ist() then raise exception 'date_passed'; end if;
  if exists (select 1 from public.leave_request_days d join public.leave_requests r on r.id = d.request_id
              where d.employee_id = a and d.leave_date = h.holiday_date and d.is_active) then
    raise exception 'on_leave';
  end if;
  yr := extract(year from h.holiday_date)::int;
  select count(*) into used from public.optional_holiday_requests r join public.holidays hh on hh.id = r.holiday_id
   where r.employee_id = a and r.status in ('pending', 'approved') and extract(year from hh.holiday_date)::int = yr;
  if used >= private.setting_int('optional_holidays_per_year') then raise exception 'optional_quota_exceeded'; end if;
  begin
    insert into public.optional_holiday_requests(employee_id, holiday_id) values (a, p_holiday) returning id into new_id;
  exception when unique_violation then raise exception 'duplicate_request';
  end;
  return new_id;
end $$;

create function public.decide_optional_holiday(p_id uuid, p_decision text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); r public.optional_holiday_requests; h public.holidays;
begin
  select * into r from public.optional_holiday_requests where id = p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  if not private.can_decide(r.employee_id) then raise exception 'forbidden'; end if;
  if r.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision'; end if;
  if p_decision = 'reject' and (p_comment is null or btrim(p_comment) = '') then raise exception 'comment_required'; end if;
  select * into h from public.holidays where id = r.holiday_id;
  update public.optional_holiday_requests set status = case when p_decision = 'approve' then 'approved' else 'rejected' end::public.req_status_t,
         decided_by = a, decided_at = private.clock_now(), decided_comment = nullif(btrim(p_comment), '') where id = r.id;
  if p_decision = 'approve' then perform private.release_conflicting_leave(h.holiday_date); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Regularisation (AR-11) -------------------------------------------------------------------------------------------
create function public.request_regularisation(p_date date, p_in timestamptz, p_out timestamptz, p_reason text) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); e public.employees; att uuid; new_id uuid; today date := private.today_ist();
begin
  select * into e from public.employees where id = a;
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'reason_required'; end if;
  if p_date > today or p_date < today - private.setting_int('leave_backdate_days') then raise exception 'outside_window'; end if;
  if p_date < e.date_of_joining or (e.last_working_day is not null and p_date > e.last_working_day) then raise exception 'not_employed'; end if;
  if (p_in at time zone 'Asia/Kolkata')::date <> p_date then raise exception 'time_not_on_date'; end if;
  if p_out is not null and p_out <= p_in then raise exception 'out_before_in'; end if;
  select x.id into att from public.attendance x where x.employee_id = a and x.work_date = p_date;
  begin
    insert into public.regularisation_requests(employee_id, work_date, attendance_id, requested_in, requested_out, reason)
    values (a, p_date, att, p_in, p_out, btrim(p_reason)) returning id into new_id;
  exception when unique_violation then raise exception 'duplicate_request';
  end;
  return new_id;
end $$;

create function public.decide_regularisation(p_id uuid, p_decision text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); r public.regularisation_requests;
begin
  select * into r from public.regularisation_requests where id = p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  if not private.can_decide(r.employee_id) then raise exception 'forbidden'; end if;
  if r.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision'; end if;
  if p_decision = 'reject' and (p_comment is null or btrim(p_comment) = '') then raise exception 'comment_required'; end if;
  if p_decision = 'approve' then
    -- Attendance changes only here, after approval (AR-11).
    insert into public.attendance(employee_id, check_in, check_out, source)
    values (r.employee_id, r.requested_in, r.requested_out, 'regularised')
    on conflict on constraint uq_attendance_day
      do update set check_in = excluded.check_in, check_out = excluded.check_out, source = 'regularised';
  end if;
  update public.regularisation_requests set status = case when p_decision = 'approve' then 'approved' else 'rejected' end::public.req_status_t,
         decided_by = a, decided_at = private.clock_now(), decided_comment = nullif(btrim(p_comment), '') where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

create function public.cancel_request(p_kind text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); n integer;
begin
  if p_kind = 'wfh' then
    update public.wfh_requests set status = 'cancelled' where id = p_id and employee_id = a and status = 'pending';
  elsif p_kind = 'regularisation' then
    update public.regularisation_requests set status = 'cancelled' where id = p_id and employee_id = a and status = 'pending';
  elsif p_kind = 'optional_holiday' then
    update public.optional_holiday_requests r set status = 'cancelled'
     where r.id = p_id and r.employee_id = a
       and (r.status = 'pending' or (r.status = 'approved'
            and (select h.holiday_date from public.holidays h where h.id = r.holiday_id) > private.today_ist()));
  else raise exception 'invalid_kind';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'cannot_cancel'; end if;
  return jsonb_build_object('ok', true);
end $$;

create function public.hr_correct_attendance(p_emp uuid, p_date date, p_in timestamptz, p_out timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr();
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then raise exception 'reason_required'; end if;
  if (p_in at time zone 'Asia/Kolkata')::date <> p_date then raise exception 'time_not_on_date'; end if;
  perform set_config('app.audit_reason', btrim(p_reason), true);
  perform set_config('app.audit_action', 'correction', true);
  insert into public.attendance(employee_id, check_in, check_out, source)
  values (p_emp, p_in, p_out, 'hr_correction')
  on conflict on constraint uq_attendance_day
    do update set check_in = excluded.check_in, check_out = excluded.check_out, source = 'hr_correction';
end $$;

-- Employees ----------------------------------------------------------------------------------------------------------
create function public.hr_create_employee(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr(); new_id uuid; code text;
begin
  insert into public.employees(full_name, email, dob, gender, date_of_joining, designation, salary_grade,
                               location_id, department_id, reporting_manager_id, is_hr_admin)
  values (p ->> 'full_name', p ->> 'email', (p ->> 'dob')::date, (p ->> 'gender')::public.gender_t,
          (p ->> 'date_of_joining')::date, p ->> 'designation', nullif(p ->> 'salary_grade', ''),
          (p ->> 'location_id')::uuid, (p ->> 'department_id')::uuid, nullif(p ->> 'reporting_manager_id', '')::uuid,
          coalesce((p ->> 'is_hr_admin')::boolean, false))
  returning id, employee_code into new_id, code;
  insert into public.employee_contact(employee_id, mobile, address_line1, address_line2, city, state_code, pin_code, ec_name, ec_relationship, ec_mobile)
  values (new_id, p ->> 'mobile', nullif(p ->> 'address_line1', ''), nullif(p ->> 'address_line2', ''), nullif(p ->> 'city', ''),
          nullif(p ->> 'state_code', ''), nullif(p ->> 'pin_code', ''), nullif(p ->> 'ec_name', ''),
          nullif(p ->> 'ec_relationship', ''), nullif(p ->> 'ec_mobile', ''));
  insert into public.employee_statutory(employee_id, pan, uan, aadhaar_ciphertext, aadhaar_last4)
  values (new_id, p ->> 'pan', nullif(p ->> 'uan', ''), decode(p ->> 'aadhaar_ct', 'base64'), p ->> 'aadhaar_last4');
  insert into public.employee_bank(employee_id, account_number, ifsc, bank_name)
  values (new_id, p ->> 'account_number', p ->> 'ifsc', p ->> 'bank_name');
  return jsonb_build_object('id', new_id, 'employee_code', code);
end $$;

create function public.hr_update_employee(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr();
begin
  update public.employees set
    full_name = case when p ? 'full_name' then p ->> 'full_name' else full_name end,
    email = case when p ? 'email' then p ->> 'email' else email end,
    dob = case when p ? 'dob' then (p ->> 'dob')::date else dob end,
    gender = case when p ? 'gender' then (p ->> 'gender')::public.gender_t else gender end,
    date_of_joining = case when p ? 'date_of_joining' then (p ->> 'date_of_joining')::date else date_of_joining end,
    designation = case when p ? 'designation' then p ->> 'designation' else designation end,
    salary_grade = case when p ? 'salary_grade' then nullif(p ->> 'salary_grade', '') else salary_grade end,
    department_id = case when p ? 'department_id' then (p ->> 'department_id')::uuid else department_id end,
    reporting_manager_id = case when p ? 'reporting_manager_id' then nullif(p ->> 'reporting_manager_id', '')::uuid else reporting_manager_id end,
    is_hr_admin = case when p ? 'is_hr_admin' then (p ->> 'is_hr_admin')::boolean else is_hr_admin end
  where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.update_contact(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor();
begin
  if p_id <> a and not private.is_hr_admin() then raise exception 'forbidden'; end if;
  update public.employee_contact set
    mobile = case when p ? 'mobile' then p ->> 'mobile' else mobile end,
    address_line1 = case when p ? 'address_line1' then nullif(p ->> 'address_line1', '') else address_line1 end,
    address_line2 = case when p ? 'address_line2' then nullif(p ->> 'address_line2', '') else address_line2 end,
    city = case when p ? 'city' then nullif(p ->> 'city', '') else city end,
    state_code = case when p ? 'state_code' then nullif(p ->> 'state_code', '') else state_code end,
    pin_code = case when p ? 'pin_code' then nullif(p ->> 'pin_code', '') else pin_code end,
    ec_name = case when p ? 'ec_name' then nullif(p ->> 'ec_name', '') else ec_name end,
    ec_relationship = case when p ? 'ec_relationship' then nullif(p ->> 'ec_relationship', '') else ec_relationship end,
    ec_mobile = case when p ? 'ec_mobile' then nullif(p ->> 'ec_mobile', '') else ec_mobile end
  where employee_id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.hr_update_statutory(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr();
begin
  update public.employee_statutory set
    pan = case when p ? 'pan' then p ->> 'pan' else pan end,
    uan = case when p ? 'uan' then nullif(p ->> 'uan', '') else uan end,
    aadhaar_ciphertext = case when p ? 'aadhaar_ct' then decode(p ->> 'aadhaar_ct', 'base64') else aadhaar_ciphertext end,
    aadhaar_last4 = case when p ? 'aadhaar_last4' then p ->> 'aadhaar_last4' else aadhaar_last4 end
  where employee_id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.hr_update_bank(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr();
begin
  update public.employee_bank set
    account_number = case when p ? 'account_number' then p ->> 'account_number' else account_number end,
    ifsc = case when p ? 'ifsc' then p ->> 'ifsc' else ifsc end,
    bank_name = case when p ? 'bank_name' then p ->> 'bank_name' else bank_name end
  where employee_id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.deactivate_employee(p_id uuid, p_lwd date) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr();
begin
  if p_id = a then raise exception 'cannot_deactivate_self'; end if;
  update public.employees set status = 'inactive', last_working_day = p_lwd where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $$;

create function public.transfer_employee(p_id uuid, p_location uuid, p_effective date) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr(); e public.employees;
begin
  select * into e from public.employees where id = p_id;
  if e.id is null then raise exception 'not_found'; end if;
  if p_effective < e.date_of_joining then raise exception 'before_joining'; end if;
  if exists (select 1 from public.month_exports m where m.month >= date_trunc('month', p_effective)::date) then
    raise exception 'month_exported';
  end if;
  insert into public.employee_location_history(employee_id, effective_from, location_id)
  values (p_id, p_effective, p_location)
  on conflict (employee_id, effective_from) do update set location_id = excluded.location_id;
  update public.employees set location_id = private.location_on(p_id, private.today_ist()) where id = p_id;
  perform private.release_conflicting_leave(p_effective);
end $$;

-- Reveal PAN / bank account for HR only; Aadhaar has no branch here by design (LR-22) ---------------------------------------
create function public.reveal_statutory(p_id uuid, p_field text) returns text
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr(); v text;
begin
  if p_field = 'pan' then select s.pan into v from public.employee_statutory s where s.employee_id = p_id;
  elsif p_field = 'bank_account' then select b.account_number into v from public.employee_bank b where b.employee_id = p_id;
  else raise exception 'invalid_field';
  end if;
  if v is null then raise exception 'not_found'; end if;
  insert into public.audit_log(table_name, record_id, field, old_value, new_value, action, changed_by, changed_at)
  values (case when p_field = 'pan' then 'employee_statutory' else 'employee_bank' end, p_id, p_field, null, null,
          'reveal', a, private.clock_now());
  return v;
end $$;

-- Configuration ------------------------------------------------------------------------------------------------------------
create function public.hr_upsert_location(p jsonb) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr(); lid uuid := nullif(p ->> 'id', '')::uuid;
begin
  if lid is null then
    insert into public.locations(name, city, state_code, is_active)
    values (p ->> 'name', p ->> 'city', p ->> 'state_code', coalesce((p ->> 'is_active')::boolean, true)) returning id into lid;
  else
    update public.locations set name = coalesce(p ->> 'name', name), city = coalesce(p ->> 'city', city),
           state_code = coalesce(p ->> 'state_code', state_code), is_active = coalesce((p ->> 'is_active')::boolean, is_active)
     where id = lid;
  end if;
  return lid;
end $$;

create function public.hr_set_weekly_offs(p_location uuid, p_days smallint[], p_effective date) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr();
begin
  if exists (select 1 from public.month_exports m where m.month >= date_trunc('month', p_effective)::date) then
    raise exception 'month_exported';
  end if;
  insert into public.location_weekly_offs(location_id, effective_from, weekly_off_days)
  values (p_location, p_effective, p_days)
  on conflict (location_id, effective_from) do update set weekly_off_days = excluded.weekly_off_days;
  perform private.release_conflicting_leave(p_effective);
end $$;

create function public.hr_upsert_department(p jsonb) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr(); did uuid := nullif(p ->> 'id', '')::uuid;
begin
  if did is null then
    insert into public.departments(name, is_active) values (p ->> 'name', coalesce((p ->> 'is_active')::boolean, true)) returning id into did;
  else
    if p ? 'is_active' and not (p ->> 'is_active')::boolean
       and exists (select 1 from public.employees e where e.department_id = did and e.status = 'active') then
      raise exception 'department_in_use';
    end if;
    update public.departments set name = coalesce(p ->> 'name', name), is_active = coalesce((p ->> 'is_active')::boolean, is_active) where id = did;
  end if;
  return did;
end $$;

create function public.hr_upsert_holiday(p jsonb) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr(); hid uuid; d date := (p ->> 'holiday_date')::date;
begin
  insert into public.holidays(location_id, holiday_date, name, type)
  values ((p ->> 'location_id')::uuid, d, p ->> 'name', (p ->> 'type')::public.holiday_type_t)
  on conflict (location_id, holiday_date) do update set name = excluded.name, type = excluded.type
  returning id into hid;
  perform private.release_conflicting_leave(d);
  return hid;
end $$;

create function public.hr_delete_holiday(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr();
begin
  if p_reason is null or length(btrim(p_reason)) < 3 then raise exception 'reason_required'; end if;
  perform set_config('app.audit_reason', btrim(p_reason), true);
  if exists (select 1 from public.optional_holiday_requests where holiday_id = p_id and status in ('pending', 'approved')) then
    raise exception 'holiday_in_use';
  end if;
  delete from public.holidays where id = p_id;
end $$;

create function public.hr_upsert_leave_type_rule(p_type uuid, p_year integer, p jsonb) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_hr();
begin
  if p_year < extract(year from private.today_ist())::int then raise exception 'past_year_readonly'; end if;
  insert into public.leave_type_rules(leave_type_id, effective_from_year, annual_quota, accrual_method, accrual_per_month,
         carry_forward_max, half_day_allowed, doc_required_over_days, max_days_per_request, must_be_continuous, min_service_days)
  values (p_type, p_year, (p ->> 'annual_quota')::numeric, (p ->> 'accrual_method')::public.accrual_t,
          (p ->> 'accrual_per_month')::numeric, (p ->> 'carry_forward_max')::numeric,
          coalesce((p ->> 'half_day_allowed')::boolean, false), (p ->> 'doc_required_over_days')::integer,
          (p ->> 'max_days_per_request')::numeric, coalesce((p ->> 'must_be_continuous')::boolean, false),
          (p ->> 'min_service_days')::integer)
  on conflict (leave_type_id, effective_from_year) do update set
    annual_quota = excluded.annual_quota, accrual_method = excluded.accrual_method,
    accrual_per_month = excluded.accrual_per_month, carry_forward_max = excluded.carry_forward_max,
    half_day_allowed = excluded.half_day_allowed, doc_required_over_days = excluded.doc_required_over_days,
    max_days_per_request = excluded.max_days_per_request, must_be_continuous = excluded.must_be_continuous,
    min_service_days = excluded.min_service_days;
end $$;

-- Reports ---------------------------------------------------------------------------------------------------------------------
create function public.log_month_export(p_month date, p_scope text, p_rows integer, p_hash text) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); new_id uuid;
begin
  if not (private.is_hr_admin() or private.is_manager()) then raise exception 'forbidden'; end if;
  insert into public.month_exports(month, scope, exported_by, row_count, content_hash)
  values (date_trunc('month', p_month)::date, p_scope, a, p_rows, p_hash) returning id into new_id;
  return new_id;
end $$;

-- Identity and people lookups used by the app shell ---------------------------------------------------------------------------------
create function public.whoami() returns jsonb
language sql stable security definer set search_path = public, private, pg_temp as $$
  select case when private.actor_id() is null then null else (
    select jsonb_build_object('id', e.id, 'employee_code', e.employee_code, 'full_name', e.full_name,
      'email', e.email, 'is_hr_admin', e.is_hr_admin, 'is_manager', private.is_manager(),
      'location_id', e.location_id, 'location_name', l.name, 'gender', e.gender,
      'manager_name', (select m.full_name from public.employees m where m.id = e.reporting_manager_id))
    from public.employees e join public.locations l on l.id = e.location_id where e.id = private.actor_id()) end
$$;

create function public.team_members()
returns table (id uuid, employee_code text, full_name text, designation text, department_name text, location_name text, status public.emp_status_t)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select e.id, e.employee_code, e.full_name, e.designation, d.name, l.name, e.status
  from public.employees e join public.departments d on d.id = e.department_id join public.locations l on l.id = e.location_id
  where e.status = 'active' and private.actor_id() is not null
    and (private.is_hr_admin() or e.reporting_manager_id = private.actor_id())
  order by e.full_name
$$;

create function public.pending_approvals()
returns table (kind text, id uuid, employee_id uuid, employee_code text, employee_name text, summary jsonb, created_at timestamptz)
language sql stable security definer set search_path = public, private, pg_temp as $$
  select 'leave', r.id, e.id, e.employee_code, e.full_name,
         jsonb_build_object('type', t.name, 'type_code', t.code, 'from', r.from_date, 'to', r.to_date, 'days', r.days,
                            'lop_days', r.lop_days, 'reason', r.reason, 'attachment', r.attachment_path,
                            'half_day', r.is_half_day,
                            'clashes', (select coalesce(jsonb_agg(distinct x.full_name), '[]'::jsonb)
                                          from public.leave_request_days d2 join public.employees x on x.id = d2.employee_id
                                         where d2.is_active and d2.employee_id <> e.id and d2.leave_date between r.from_date and r.to_date
                                           and x.reporting_manager_id is not distinct from e.reporting_manager_id)),
         r.created_at
  from public.leave_requests r join public.employees e on e.id = r.employee_id join public.leave_types t on t.id = r.leave_type_id
  where r.status = 'pending' and private.can_decide(e.id)
  union all
  select 'regularisation', g.id, e.id, e.employee_code, e.full_name,
         jsonb_build_object('work_date', g.work_date, 'requested_in', g.requested_in, 'requested_out', g.requested_out, 'reason', g.reason),
         g.created_at
  from public.regularisation_requests g join public.employees e on e.id = g.employee_id
  where g.status = 'pending' and private.can_decide(e.id)
  union all
  select 'wfh', w.id, e.id, e.employee_code, e.full_name,
         jsonb_build_object('work_date', w.work_date, 'reason', w.reason), w.created_at
  from public.wfh_requests w join public.employees e on e.id = w.employee_id
  where w.status = 'pending' and private.can_decide(e.id)
  union all
  select 'optional_holiday', o.id, e.id, e.employee_code, e.full_name,
         jsonb_build_object('holiday', h.name, 'holiday_date', h.holiday_date), o.created_at
  from public.optional_holiday_requests o join public.employees e on e.id = o.employee_id join public.holidays h on h.id = o.holiday_id
  where o.status = 'pending' and private.can_decide(e.id)
  order by created_at
$$;

-- Policy search for the assistant (policy answers come only from stored text) -------------------------------------------------------------
create function public.search_policy(p_q text)
returns table (key text, title text, body text, version integer, score real)
language plpgsql stable security definer set search_path = public, private, pg_temp as $$
declare q_or text;
begin
  perform private.require_actor();
  select string_agg(l, ' | ') into q_or from unnest(tsvector_to_array(to_tsvector('english', coalesce(p_q, '')))) l;
  if q_or is null then return; end if;
  return query
    select d.key, d.title, d.body, d.version,
           ts_rank(to_tsvector('english', d.title || ' ' || d.body), to_tsquery('english', q_or))
    from public.policy_documents d
    where d.is_current and to_tsvector('english', d.title || ' ' || d.body) @@ to_tsquery('english', q_or)
    order by 5 desc limit 3;
end $$;

-- Agent drafts: the only write path for the assistant; confirmation is a human button ----------------------------------------------------
create function public.create_draft(p_kind text, p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); new_id uuid;
begin
  if p_kind = 'hr_reminder_email' and not private.is_hr_admin() then raise exception 'forbidden'; end if;
  insert into public.agent_drafts(employee_id, kind, payload, expires_at)
  values (a, p_kind, p_payload, private.clock_now() + interval '15 minutes') returning id into new_id;
  return new_id;
end $$;

create function public.discard_draft(p_id uuid) returns void
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor();
begin
  update public.agent_drafts set status = 'discarded' where id = p_id and employee_id = a and status = 'draft';
end $$;

create function public.confirm_draft(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare a uuid := private.require_actor(); d public.agent_drafts; res jsonb; pl jsonb; rcpt uuid; em text;
begin
  select * into d from public.agent_drafts where id = p_id for update;
  if d.id is null or d.employee_id <> a then raise exception 'not_found'; end if;
  if d.status <> 'draft' then raise exception 'draft_not_open'; end if;
  if d.expires_at < private.clock_now() then
    update public.agent_drafts set status = 'expired' where id = d.id;
    raise exception 'draft_expired';
  end if;
  pl := d.payload;
  if d.kind = 'leave_request' then
    res := public.apply_leave((pl ->> 'leave_type_id')::uuid, (pl ->> 'from_date')::date, (pl ->> 'to_date')::date,
             coalesce((pl ->> 'is_half_day')::boolean, false), pl ->> 'half_day_session', pl ->> 'reason',
             pl ->> 'attachment_path', coalesce((pl ->> 'convert_excess_to_lop')::boolean, false));
    if not (res ->> 'ok')::boolean then return res; end if;
    update public.agent_drafts set status = 'confirmed', confirmed_ref = res ->> 'id' where id = d.id;
    return res;
  elsif d.kind = 'hr_reminder_email' then
    if not private.is_hr_admin() then raise exception 'forbidden'; end if;
    for rcpt in select (x)::uuid from jsonb_array_elements_text(pl -> 'recipients') x loop
      select e.email::text into em from public.employees e where e.id = rcpt;
      if em is not null then
        perform private.queue_email(em, 'hr_reminder', jsonb_build_object('message', pl ->> 'message', 'subject', pl ->> 'subject'), d.id);
      end if;
    end loop;
    update public.agent_drafts set status = 'confirmed', confirmed_ref = 'queued' where id = d.id;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'invalid_kind';
end $$;

-- System functions: only the runtime login may call these (never `authenticated`) ----------------------------------------------------------
create function public.link_clerk_user(p_sub text, p_email text) returns uuid
language plpgsql security definer set search_path = public, private, pg_temp as $$
declare eid uuid;
begin
  select e.id into eid from public.employees e where e.clerk_user_id = p_sub;
  if eid is not null then return eid; end if;
  update public.employees set clerk_user_id = p_sub
   where email = p_email::citext and clerk_user_id is null and status = 'active'
  returning id into eid;
  return eid;
end $$;

create function public.outbox_claim(p_limit integer default 10) returns setof public.email_outbox
language sql security definer set search_path = public, private, pg_temp as $$
  update public.email_outbox o set attempts = attempts + 1
   where o.id in (select x.id from public.email_outbox x where x.status in ('pending', 'failed') and x.attempts < 5
                   order by x.created_at limit p_limit for update skip locked)
  returning o.*
$$;

create function public.outbox_mark(p_id uuid, p_status text, p_error text default null) returns void
language sql security definer set search_path = public, private, pg_temp as $$
  update public.email_outbox set status = p_status, last_error = p_error,
         sent_at = case when p_status = 'sent' then now() end where id = p_id
$$;

-- Grants -------------------------------------------------------------------------------------------------------------------------------------
grant execute on function
  public.check_in(), public.check_out(), public.request_wfh(date, text), public.decide_wfh(uuid, text, text),
  public.request_optional_holiday(uuid), public.decide_optional_holiday(uuid, text, text),
  public.request_regularisation(date, timestamptz, timestamptz, text), public.decide_regularisation(uuid, text, text),
  public.cancel_request(text, uuid), public.hr_correct_attendance(uuid, date, timestamptz, timestamptz, text),
  public.hr_create_employee(jsonb), public.hr_update_employee(uuid, jsonb), public.update_contact(uuid, jsonb),
  public.hr_update_statutory(uuid, jsonb), public.hr_update_bank(uuid, jsonb), public.deactivate_employee(uuid, date),
  public.transfer_employee(uuid, uuid, date), public.reveal_statutory(uuid, text),
  public.hr_upsert_location(jsonb), public.hr_set_weekly_offs(uuid, smallint[], date), public.hr_upsert_department(jsonb),
  public.hr_upsert_holiday(jsonb), public.hr_delete_holiday(uuid, text), public.hr_upsert_leave_type_rule(uuid, integer, jsonb),
  public.log_month_export(date, text, integer, text), public.whoami(), public.team_members(), public.pending_approvals(),
  public.search_policy(text), public.create_draft(text, jsonb), public.discard_draft(uuid), public.confirm_draft(uuid)
  to authenticated;

grant execute on function public.link_clerk_user(text, text), public.outbox_claim(integer),
  public.outbox_mark(uuid, text, text) to app_runtime;
