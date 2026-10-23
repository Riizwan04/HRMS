-- 0005_reference_data: states/UTs, Konkan leave policy (RESEARCH.md section 10.3), policy text for the assistant.

insert into public.indian_states(code, name, kind) values
  ('AP','Andhra Pradesh','state'),('AR','Arunachal Pradesh','state'),('AS','Assam','state'),('BR','Bihar','state'),
  ('CG','Chhattisgarh','state'),('GA','Goa','state'),('GJ','Gujarat','state'),('HR','Haryana','state'),
  ('HP','Himachal Pradesh','state'),('JH','Jharkhand','state'),('KA','Karnataka','state'),('KL','Kerala','state'),
  ('MP','Madhya Pradesh','state'),('MH','Maharashtra','state'),('MN','Manipur','state'),('ML','Meghalaya','state'),
  ('MZ','Mizoram','state'),('NL','Nagaland','state'),('OD','Odisha','state'),('PB','Punjab','state'),
  ('RJ','Rajasthan','state'),('SK','Sikkim','state'),('TN','Tamil Nadu','state'),('TS','Telangana','state'),
  ('TR','Tripura','state'),('UP','Uttar Pradesh','state'),('UK','Uttarakhand','state'),('WB','West Bengal','state'),
  ('AN','Andaman and Nicobar Islands','ut'),('CH','Chandigarh','ut'),
  ('DH','Dadra and Nagar Haveli and Daman and Diu','ut'),('DL','Delhi','ut'),('JK','Jammu and Kashmir','ut'),
  ('LA','Ladakh','ut'),('LD','Lakshadweep','ut'),('PY','Puducherry','ut');

insert into public.leave_types(code, name, is_paid, counts_calendar_days, applicable_gender, is_event_based) values
  ('CL', 'Casual Leave', true, false, 'any', false),
  ('SL', 'Sick Leave', true, false, 'any', false),
  ('EL', 'Earned Leave', true, false, 'any', false),
  ('ML', 'Maternity Leave', true, true, 'female', true),
  ('PL', 'Paternity Leave', true, false, 'male', true),
  ('LOP', 'Loss of Pay', false, false, 'any', false);

insert into public.leave_type_rules(leave_type_id, effective_from_year, annual_quota, accrual_method, accrual_per_month,
  carry_forward_max, half_day_allowed, doc_required_over_days, max_days_per_request, must_be_continuous, min_service_days)
select t.id, 2000, v.quota, v.accr::public.accrual_t, v.per_month, v.carry, v.half, v.doc, v.maxd, v.cont, v.minsvc
from public.leave_types t
join (values
  ('CL',  8.0::numeric, 'upfront_prorated', null::numeric, 0.0::numeric, true,  null::int, null::numeric, false, null::int),
  ('SL',  7.0,          'upfront_prorated', null,          0.0,          true,  2,         null,          false, null),
  ('EL',  15.0,         'monthly',          1.25,          30.0,         false, null,      null,          false, null),
  ('ML',  null,         'on_request',       null,          null,         false, 0,         182.0,         true,  80),
  ('PL',  null,         'on_request',       null,          null,         false, null,      5.0,           true,  null),
  ('LOP', null,         'none',             null,          null,         true,  null,      null,          false, null)
) as v(code, quota, accr, per_month, carry, half, doc, maxd, cont, minsvc) on v.code = t.code;

insert into public.policy_documents(key, title, body, effective_from) values
('leave_types', 'Leave types and quotas',
 'Leave year is January to December. Casual Leave (CL): 8 days a year, credited on 1 January and pro-rated for joiners, lapses on 31 December, half day allowed. Sick Leave (SL): 7 days a year, credited on 1 January and pro-rated for joiners, lapses on 31 December, half day allowed; sick leave of more than 2 consecutive days needs a medical certificate upload. Earned Leave (EL): 15 days a year, earned at 1.25 days for every completed month; up to 30 days carry forward to the next year; no half day. Maternity Leave: 26 calendar weeks (182 continuous calendar days) as per the Maternity Benefit Act, with no deduction from CL, SL or EL; the employee must have served at least 80 days. Paternity Leave: 5 consecutive working days, no deduction from CL, SL or EL. Loss of Pay (LOP): unpaid leave, unlimited, half day allowed.', '2026-01-01'),
('leave_rules', 'Applying for leave',
 'Leave days are working days only: weekly offs and holidays inside a leave period are never counted as leave. Konkan has no sandwich rule. A Saturday is a working day at the Verna plant but a weekly off at the Panaji head office. An employee cannot apply for more leave than the available balance; the app offers to convert the excess to Loss of Pay. Leave cannot be applied for dates more than 30 days in the past. The balance changes only when the manager approves; a pending request does not change the balance. An employee can cancel a pending request, or an approved request that has not started, and the balance is restored. A manager cannot approve their own leave.', '2026-01-01'),
('attendance', 'Attendance, late marks and half days',
 'Check in and check out once a day; all times are in IST. Worked 8 hours or more is Present. Worked 4 hours to under 8 hours is a Half Day, which counts as half a day present and half a day Loss of Pay unless an approved half-day leave covers the other half. Under 4 hours or no punch is Absent. A check-in without a check-out is Absent until corrected through regularisation. Check-in after 10:15 AM is marked Late. Every three Late marks in a calendar month convert into one half day of Loss of Pay. A day with approved leave is On Leave even if the employee also punched in.', '2026-01-01'),
('weekly_offs', 'Weekly offs and working week',
 'Head office (Panaji): Monday to Friday, weekly offs on Saturday and Sunday. Plant (Verna): Monday to Saturday, weekly off on Sunday. Weekly offs are set per location.', '2026-01-01'),
('holidays', 'Holidays and optional holidays',
 'Holidays are set per location and marked National, State or Optional. National and State holidays are paid holidays for everyone at that location. An employee can choose up to 2 Optional holidays per calendar year; once the manager approves, that day is treated as a paid public holiday with no leave deduction.', '2026-01-01'),
('wfh_regularisation', 'Work from home and regularisation',
 'Work from home: the employee requests a day with a reason; once the manager approves it counts as a full Present day. WFH cannot be requested for weekly offs, holidays or days on leave. Regularisation: if a punch was missed, the employee can request a correction with a reason for any day within the last 30 days; attendance changes only after the manager approves. Only the manager (or HR) can approve; nobody can approve their own request.', '2026-01-01');
