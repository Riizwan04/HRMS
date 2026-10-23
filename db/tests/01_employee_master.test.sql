-- Employee Master checklist (brief p.19) + audit, masking and access (E1-E8, DV-*).
begin;
\i db/tests/_fixtures.inc
select plan(25);

-- E1: HR adds an employee; code is generated and unique (DV-10)
select tests.login('u_hr');
select ok((select (public.hr_create_employee(tests.payload()) ->> 'employee_code') ~ '^KCF[0-9]{4,}$'),
          'E1/DV-10: employee code is generated automatically in KCF0000 format');
select isnt((public.hr_create_employee(tests.payload('{"email":"second.person@example.in"}')) ->> 'employee_code'),
            (select employee_code from public.employees where email = 'new.person@example.in'),
            'E1/DV-10: a second employee gets a different code');

-- Validation messages (DV-1, DV-4, DV-5, DV-7)
select throws_ok($$ select public.hr_create_employee(tests.payload('{"email":"a1@example.in","pan":"ABC123"}')) $$,
                 '23514', null, 'DV-1: invalid PAN ABC123 is rejected');
select throws_ok($$ select public.hr_create_employee(tests.payload('{"email":"a2@example.in","ifsc":"HDFC1234567"}')) $$,
                 '23514', null, 'DV-4: invalid IFSC is rejected');
select throws_ok($$ select public.hr_create_employee(tests.payload('{"email":"a3@example.in","mobile":"987654321"}')) $$,
                 '23514', null, 'DV-5: 9-digit mobile is rejected');
select throws_ok($$ select public.hr_create_employee(tests.payload('{"email":"a4@example.in","dob":"2009-10-05","date_of_joining":"2026-10-01"}')) $$,
                 '23514', null, 'DV-7: employee aged 17 on joining date is rejected');

-- E4: reporting structure (DV-9)
select tests.logout();
select throws_ok(format($$ update public.employees set reporting_manager_id = %L where id = %L $$, tests.id('emp1'), tests.id('emp1')),
                 'P0001', 'manager_cycle', 'DV-9: nobody reports to themselves');
update public.employees set reporting_manager_id = tests.id('emp1') where id = tests.id('emp2');
select throws_ok(format($$ update public.employees set reporting_manager_id = %L where id = %L $$, tests.id('emp2'), tests.id('emp1')),
                 'P0001', 'manager_cycle', 'E4/DV-9: A reports to B, then B reporting to A is blocked');
select throws_ok(format($$ update public.employees set reporting_manager_id = %L where id = %L $$, tests.id('emp2'), tests.id('mgr')),
                 'P0001', 'manager_cycle', 'DV-9: longer chain loops are blocked too');
update public.employees set reporting_manager_id = tests.id('mgr') where id = tests.id('emp2');

-- Employee code is immutable (DV-10)
select throws_ok(format($$ update public.employees set employee_code = 'KCF9999' where id = %L $$, tests.id('emp1')),
                 'P0001', 'employee_code_immutable', 'DV-10: employee code can never change');

-- Profile access: URL tampering returns nothing (E3 / RLS)
select tests.login('u_emp1');
select is((select count(*)::int from public.employees where id = tests.id('emp2')), 0,
          'RLS: an employee cannot open another employee''s profile');
select is((select count(*)::int from public.employees where id = tests.id('emp1')), 1, 'RLS: an employee can open their own profile');

-- E5 self-service: contact yes, job fields no
select lives_ok(format($$ select public.update_contact(%L, '{"mobile":"9000000001"}') $$, tests.id('emp1')),
                'E5: employee edits own phone');
select throws_ok(format($$ select public.update_contact(%L, '{"mobile":"9000000002"}') $$, tests.id('emp2')),
                 'P0001', 'forbidden', 'E5: employee cannot edit someone else''s contact');
select throws_ok(format($$ select public.hr_update_employee(%L, '{"designation":"CEO"}') $$, tests.id('emp1')),
                 'P0001', 'forbidden', 'E5: job fields are read-only for the employee');

-- E7 masking: PAN, Aadhaar, bank; Aadhaar can never be revealed (LR-22)
select is((select pan_masked from public.v_statutory_masked), 'ABCDE****F', 'E7: PAN shows as ABCDE****F');
select is((select aadhaar_masked from public.v_statutory_masked), 'XXXX XXXX 1234', 'E7: Aadhaar shows as XXXX XXXX 1234');
select is((select account_masked from public.v_bank_masked), '•••••••• 9012', 'E7: bank account shows last 4 digits');
select throws_ok($$ select aadhaar_ciphertext from public.employee_statutory $$, '42501', null,
                 'Aadhaar: the raw statutory table cannot be read at all');
select tests.login('u_hr');
select throws_ok(format($$ select public.reveal_statutory(%L, 'aadhaar') $$, tests.id('emp1')), 'P0001', 'invalid_field',
                 'LR-22: Aadhaar has no reveal, even for HR');
select is(public.reveal_statutory(tests.id('emp1'), 'pan'), 'ABCDE1234F', 'LR-22: HR can reveal PAN');
select ok(exists (select 1 from public.audit_log where action = 'reveal' and field = 'pan' and record_id = tests.id('emp1')),
          'LR-22: every reveal is audit-logged');

-- E8 audit trail: designation change, masked sensitive values, append-only
select public.hr_update_employee(tests.id('emp2'), '{"designation":"Senior Executive"}');
select ok(exists (select 1 from public.audit_log where table_name = 'employees' and field = 'designation'
                    and old_value = 'Staff' and new_value = 'Senior Executive' and changed_by = tests.id('hr')),
          'E8: changing a designation records who, old and new value');

select tests.logout();
update public.employee_statutory set pan = 'ZZZZZ9999Z' where employee_id = tests.id('emp1');
select is((select new_value from public.audit_log where field = 'pan' and record_id = tests.id('emp1') order by id desc limit 1),
          'ZZZZZ****Z', 'E8: sensitive values are stored masked in the audit log');
select throws_ok($$ update public.audit_log set field = 'x' $$, 'P0001', 'audit_log is append-only', 'E8: audit log cannot be edited');

select * from finish();
rollback;
