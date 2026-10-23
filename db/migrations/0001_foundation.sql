-- 0001_foundation: extensions, roles, private schema, policy settings, IST clock.
create extension if not exists pgcrypto;
create extension if not exists citext;

create schema if not exists private;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime login noinherit;
  end if;
end $$;

-- app_runtime may only act as `authenticated` (SET LOCAL ROLE) and run a few system functions.
grant authenticated to app_runtime;

grant usage on schema public to authenticated, app_runtime;
grant usage on schema private to authenticated, app_runtime;

-- New functions must not be executable by PUBLIC by default (ARCHITECTURE section 5).
alter default privileges revoke execute on functions from public;

-- Every session defaults to IST (ARCHITECTURE section 8). Business logic still uses explicit AT TIME ZONE.
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Asia/Kolkata');
end $$;

create table public.policy_settings (
  key text primary key,
  value jsonb not null,
  description text
);

-- Clock: only the dedicated test database honours app.test_now, so production cannot be time-travelled.
create function private.clock_now() returns timestamptz
language sql stable as $$
  select case
    when current_database() = 'hrms_test'
         and nullif(current_setting('app.test_now', true), '') is not null
      then current_setting('app.test_now')::timestamptz
    else now()
  end
$$;

create function private.today_ist() returns date
language sql stable as $$
  select (private.clock_now() at time zone 'Asia/Kolkata')::date
$$;

create function private.setting(k text) returns text
language sql stable as $$
  select value #>> '{}' from public.policy_settings where key = k
$$;

create function private.setting_int(k text) returns integer
language sql stable as $$
  select private.setting(k)::integer
$$;

grant execute on function private.clock_now(), private.today_ist(), private.setting(text), private.setting_int(text)
  to authenticated, app_runtime;
grant select on public.policy_settings to authenticated;

insert into public.policy_settings(key, value, description) values
  ('late_cutoff_time', '"10:15:00"', 'Check-in strictly after this IST time is Late (AR-6)'),
  ('late_marks_per_half_day', '3', 'Late marks that convert to 0.5 day LOP per calendar month (AR-6)'),
  ('present_min_minutes', '480', 'Worked minutes for Present (AR-4)'),
  ('half_day_min_minutes', '240', 'Worked minutes for Half Day (AR-4)'),
  ('leave_backdate_days', '30', 'Leave and regularisation may not be dated further back (LR-13)'),
  ('optional_holidays_per_year', '2', 'Optional holidays per employee per calendar year (LR-20)'),
  ('agent_max_tool_calls', '5', 'Maximum tool calls per assistant question');
