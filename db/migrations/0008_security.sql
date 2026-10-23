-- 0008_security: row-level security on every table, minimal grants, masked views (ARCHITECTURE.md section 5).
-- app_runtime owns nothing and has no table privileges; the app acts as `authenticated` via SET LOCAL ROLE.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, authenticated, app_runtime', t);
  end loop;
end $$;
revoke all on all sequences in schema public from public, authenticated, app_runtime;

-- Reference data: readable by any signed-in, linked employee ---------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['indian_states','departments','locations','location_weekly_offs','holidays',
                           'leave_types','leave_type_rules','policy_documents','policy_settings'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.actor_id() is not null)', t || '_read', t);
  end loop;
end $$;

-- Employee data ---------------------------------------------------------------------------------------------------
grant select on public.employees to authenticated;
create policy employees_read on public.employees for select to authenticated
  using (id = private.actor_id() or private.is_hr_admin());

grant select on public.employee_contact to authenticated;
create policy contact_read on public.employee_contact for select to authenticated
  using (employee_id = private.actor_id() or private.is_hr_admin());

grant select on public.employee_location_history to authenticated;
create policy loc_history_read on public.employee_location_history for select to authenticated
  using (employee_id = private.actor_id() or private.is_hr_admin());

-- employee_statutory and employee_bank: RLS on, NO grants and NO policies. Reads go through the masked views below.

-- Rows visible to the person, their manager and HR ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['attendance','regularisation_requests','wfh_requests','optional_holiday_requests',
                           'leave_requests','leave_request_days','leave_adjustments','leave_opening_balances'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.can_view_employee(employee_id))', t || '_read', t);
  end loop;
end $$;

-- Audit: HR only. Exports: HR, or the person who exported. Drafts: owner. Agent log: own rows or HR -------------------
grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (private.is_hr_admin());

grant select on public.month_exports to authenticated;
create policy exports_read on public.month_exports for select to authenticated
  using (private.is_hr_admin() or exported_by = private.actor_id());

grant select on public.agent_drafts to authenticated;
create policy drafts_read on public.agent_drafts for select to authenticated using (employee_id = private.actor_id());

grant select, insert on public.agent_log to authenticated;
create policy agent_log_read on public.agent_log for select to authenticated
  using (employee_id = private.actor_id() or private.is_hr_admin());
create policy agent_log_insert on public.agent_log for insert to authenticated
  with check (employee_id = private.actor_id());

-- email_outbox: no grants, no policies (only the SECURITY DEFINER functions touch it).

-- Masked views: owner-run, filtered by the caller's own identity. Aadhaar only ever appears as XXXX XXXX 1234. ----------
create view public.v_statutory_masked as
  select s.employee_id, private.mask_pan(s.pan) as pan_masked, private.mask_aadhaar(s.aadhaar_last4) as aadhaar_masked, s.uan
  from public.employee_statutory s
  where s.employee_id = private.actor_id() or private.is_hr_admin();

create view public.v_bank_masked as
  select b.employee_id, private.mask_account(b.account_number) as account_masked, b.ifsc, b.bank_name
  from public.employee_bank b
  where b.employee_id = private.actor_id() or private.is_hr_admin();

grant select on public.v_statutory_masked, public.v_bank_masked to authenticated;
