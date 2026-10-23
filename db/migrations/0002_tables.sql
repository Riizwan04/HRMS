-- 0002_tables: all tables, keys and constraints (ARCHITECTURE.md section 3).

create type public.gender_t as enum ('female', 'male', 'other');
create type public.emp_status_t as enum ('active', 'inactive');
create type public.req_status_t as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.holiday_type_t as enum ('national', 'state', 'optional');
create type public.accrual_t as enum ('upfront_prorated', 'monthly', 'on_request', 'none');
create type public.att_source_t as enum ('self', 'regularised', 'hr_correction');
create type public.audit_action_t as enum ('insert', 'update', 'reveal', 'config', 'correction');
create type public.leave_gender_t as enum ('any', 'female', 'male');

-- Reference data -------------------------------------------------------------
create table public.indian_states (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null unique,
  kind text not null check (kind in ('state', 'ut'))
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  is_active boolean not null default true
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) > 0),
  city text not null,
  state_code text not null references public.indian_states(code),
  is_active boolean not null default true
);

create function private.array_is_unique(a smallint[]) returns boolean
language sql immutable as $$
  select cardinality(a) = (select count(distinct x) from unnest(a) x)
$$;
grant execute on function private.array_is_unique(smallint[]) to authenticated, app_runtime;

create table public.location_weekly_offs (
  location_id uuid not null references public.locations(id),
  effective_from date not null,
  weekly_off_days smallint[] not null,
  primary key (location_id, effective_from),
  constraint chk_weekly_off_days check (
    cardinality(weekly_off_days) between 1 and 7
    and weekly_off_days <@ array[1,2,3,4,5,6,7]::smallint[]
    and private.array_is_unique(weekly_off_days)
  )
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  holiday_date date not null,
  name text not null check (length(btrim(name)) > 0),
  type public.holiday_type_t not null,
  unique (location_id, holiday_date)
);

-- Employee master ---------------------------------------------------------------
create sequence public.employee_code_seq;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique,
  employee_code text not null unique
    default ('KCF' || lpad(nextval('public.employee_code_seq')::text, 4, '0')),
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  email citext not null unique check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  dob date not null,
  gender public.gender_t not null,
  date_of_joining date not null,
  last_working_day date,
  designation text not null check (length(btrim(designation)) > 0),
  salary_grade text,
  location_id uuid not null references public.locations(id),
  department_id uuid not null references public.departments(id),
  reporting_manager_id uuid references public.employees(id),
  is_hr_admin boolean not null default false,
  status public.emp_status_t not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_code_format check (employee_code ~ '^KCF[0-9]{4,}$'),
  constraint chk_not_own_manager check (reporting_manager_id is distinct from id),
  constraint chk_age_18 check (date_of_joining >= (dob + interval '18 years')::date),
  constraint chk_lwd_after_joining check (last_working_day is null or last_working_day >= date_of_joining),
  constraint chk_inactive_has_lwd check (status <> 'inactive' or last_working_day is not null)
);
create index employees_manager_idx on public.employees(reporting_manager_id);

create table public.employee_location_history (
  employee_id uuid not null references public.employees(id),
  effective_from date not null,
  location_id uuid not null references public.locations(id),
  primary key (employee_id, effective_from)
);

create table public.employee_contact (
  employee_id uuid primary key references public.employees(id),
  mobile text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  address_line1 text,
  address_line2 text,
  city text,
  state_code text references public.indian_states(code),
  pin_code text check (pin_code ~ '^[0-9]{6}$'),
  ec_name text,
  ec_relationship text,
  ec_mobile text check (ec_mobile ~ '^[6-9][0-9]{9}$')
);

create table public.employee_statutory (
  employee_id uuid primary key references public.employees(id),
  pan text not null check (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  uan text check (uan ~ '^[0-9]{12}$'),
  aadhaar_ciphertext bytea not null,
  aadhaar_last4 text not null check (aadhaar_last4 ~ '^[0-9]{4}$')
);

create table public.employee_bank (
  employee_id uuid primary key references public.employees(id),
  account_number text not null check (account_number ~ '^[0-9]{9,18}$'),
  ifsc text not null check (ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name text not null check (length(btrim(bank_name)) > 0)
);

-- Attendance -------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  work_date date not null,
  check_in timestamptz not null,
  check_out timestamptz,
  source public.att_source_t not null default 'self',
  created_at timestamptz not null default now(),
  constraint uq_attendance_day unique (employee_id, work_date),
  constraint chk_checkout_after_checkin check (check_out is null or (check_out > check_in and check_out < check_in + interval '24 hours'))
);

create table public.regularisation_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  work_date date not null,
  attendance_id uuid references public.attendance(id),
  requested_in timestamptz not null,
  requested_out timestamptz,
  reason text not null check (length(btrim(reason)) >= 5),
  status public.req_status_t not null default 'pending',
  decided_by uuid references public.employees(id),
  decided_at timestamptz,
  decided_comment text,
  created_at timestamptz not null default now(),
  constraint chk_reg_times check (requested_out is null or requested_out > requested_in),
  constraint chk_reg_decider check (decided_by is distinct from employee_id)
);
create unique index uq_reg_pending on public.regularisation_requests(employee_id, work_date) where status = 'pending';

create table public.wfh_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  work_date date not null,
  reason text not null check (length(btrim(reason)) >= 5),
  status public.req_status_t not null default 'pending',
  decided_by uuid references public.employees(id),
  decided_at timestamptz,
  decided_comment text,
  created_at timestamptz not null default now(),
  constraint chk_wfh_decider check (decided_by is distinct from employee_id)
);
create unique index uq_wfh_active on public.wfh_requests(employee_id, work_date) where status in ('pending', 'approved');

create table public.optional_holiday_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  holiday_id uuid not null references public.holidays(id),
  status public.req_status_t not null default 'pending',
  decided_by uuid references public.employees(id),
  decided_at timestamptz,
  decided_comment text,
  created_at timestamptz not null default now(),
  constraint chk_oh_decider check (decided_by is distinct from employee_id)
);
create unique index uq_oh_active on public.optional_holiday_requests(employee_id, holiday_id) where status in ('pending', 'approved');

-- Leave -----------------------------------------------------------------------
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2,4}$'),
  name text not null,
  is_paid boolean not null default true,
  counts_calendar_days boolean not null default false,
  applicable_gender public.leave_gender_t not null default 'any',
  is_event_based boolean not null default false,
  is_active boolean not null default true
);

create table public.leave_type_rules (
  leave_type_id uuid not null references public.leave_types(id),
  effective_from_year integer not null check (effective_from_year between 2000 and 2100),
  annual_quota numeric(4,1) check (annual_quota >= 0),
  accrual_method public.accrual_t not null,
  accrual_per_month numeric(3,2),
  carry_forward_max numeric(4,1) check (carry_forward_max >= 0),
  half_day_allowed boolean not null default false,
  doc_required_over_days integer check (doc_required_over_days >= 0),
  max_days_per_request numeric(5,1) check (max_days_per_request > 0),
  must_be_continuous boolean not null default false,
  min_service_days integer check (min_service_days >= 0),
  primary key (leave_type_id, effective_from_year),
  constraint chk_monthly_rate check (accrual_method <> 'monthly' or accrual_per_month is not null),
  constraint chk_upfront_quota check (accrual_method <> 'upfront_prorated' or annual_quota is not null)
);

create table public.leave_opening_balances (
  employee_id uuid not null references public.employees(id),
  leave_type_id uuid not null references public.leave_types(id),
  year integer not null,
  days numeric(5,1) not null,
  primary key (employee_id, leave_type_id, year)
);

create table public.leave_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  leave_type_id uuid not null references public.leave_types(id),
  year integer not null,
  days numeric(4,1) not null check (days <> 0 and (days * 2) = round(days * 2)),
  reason text not null check (length(btrim(reason)) >= 3),
  created_by uuid references public.employees(id),
  created_at timestamptz not null default now()
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  leave_type_id uuid not null references public.leave_types(id),
  from_date date not null,
  to_date date not null,
  is_half_day boolean not null default false,
  half_day_session text check (half_day_session in ('first', 'second')),
  days numeric(5,1) not null check (days > 0),
  lop_days numeric(5,1) not null default 0 check (lop_days >= 0),
  reason text not null check (length(btrim(reason)) >= 5),
  status public.req_status_t not null default 'pending',
  decided_by uuid references public.employees(id),
  decided_at timestamptz,
  approver_comment text,
  attachment_path text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_leave_range check (to_date >= from_date),
  constraint chk_leave_half check (not is_half_day or (from_date = to_date and half_day_session is not null)),
  constraint chk_leave_decider check (decided_by is distinct from employee_id)
);
create index leave_requests_emp_idx on public.leave_requests(employee_id, from_date);

create table public.leave_request_days (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.leave_requests(id),
  employee_id uuid not null references public.employees(id),
  leave_date date not null,
  leave_type_id uuid not null references public.leave_types(id),
  day_fraction numeric(2,1) not null check (day_fraction in (0.5, 1.0)),
  is_active boolean not null default true
);
create unique index uq_leave_day_active on public.leave_request_days(employee_id, leave_date) where is_active;
create index leave_days_req_idx on public.leave_request_days(request_id);

-- Audit, policy text, email, agent, exports ----------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  field text,
  old_value text,
  new_value text,
  action public.audit_action_t not null,
  changed_by uuid references public.employees(id),
  changed_at timestamptz not null default now(),
  reason text
);
create index audit_log_record_idx on public.audit_log(table_name, record_id, changed_at desc);

create table public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  version integer not null default 1,
  title text not null,
  body text not null,
  effective_from date not null default current_date,
  is_current boolean not null default true,
  unique (key, version)
);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  related_id uuid,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_pending_idx on public.email_outbox(status, created_at);

create table public.agent_drafts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  kind text not null check (kind in ('leave_request', 'hr_reminder_email')),
  payload jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'expired', 'discarded')),
  expires_at timestamptz not null,
  confirmed_ref text,
  created_at timestamptz not null default now()
);

create table public.agent_log (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  conversation_id uuid not null,
  tool text not null,
  inputs jsonb,
  result jsonb,
  outcome text not null check (outcome in ('ok', 'denied', 'error', 'limit_exceeded')),
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index agent_log_emp_idx on public.agent_log(employee_id, created_at desc);

create table public.month_exports (
  id uuid primary key default gen_random_uuid(),
  month date not null check (month = date_trunc('month', month)::date),
  scope text not null,
  exported_by uuid not null references public.employees(id),
  exported_at timestamptz not null default now(),
  row_count integer not null,
  content_hash text not null
);
