// Field validation shown next to inputs (brief "India-specific business rules"). The database re-checks every one of these with
// CHECK constraints, so this file only makes the messages friendly and early; it is not the authority.
export const RE = {
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/, aadhaar: /^[0-9]{12}$/, uan: /^[0-9]{12}$/, ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  mobile: /^[6-9][0-9]{9}$/, pin: /^[0-9]{6}$/, account: /^[0-9]{9,18}$/, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
};

export type EmployeeForm = {
  full_name: string; email: string; dob: string; gender: string; date_of_joining: string; designation: string; salary_grade: string;
  location_id: string; department_id: string; reporting_manager_id: string; is_hr_admin: boolean;
  mobile: string; address_line1: string; address_line2: string; city: string; state_code: string; pin_code: string;
  ec_name: string; ec_relationship: string; ec_mobile: string;
  pan: string; aadhaar: string; uan: string; account_number: string; ifsc: string; bank_name: string;
};
export type FieldErrors = Partial<Record<keyof EmployeeForm, string>>;

const add18 = (dob: string) => `${Number(dob.slice(0, 4)) + 18}${dob.slice(4)}`;

export function validateContact(f: Pick<EmployeeForm, "mobile" | "pin_code" | "ec_mobile">): FieldErrors {
  const e: FieldErrors = {};
  if (!RE.mobile.test(f.mobile)) e.mobile = "Enter a 10-digit mobile number starting with 6, 7, 8 or 9";
  if (f.pin_code && !RE.pin.test(f.pin_code)) e.pin_code = "PIN code must be 6 digits";
  if (f.ec_mobile && !RE.mobile.test(f.ec_mobile)) e.ec_mobile = "Enter a 10-digit mobile number starting with 6, 7, 8 or 9";
  return e;
}

export function validateEmployee(f: EmployeeForm, opts: { requireAadhaar: boolean } = { requireAadhaar: true }): FieldErrors {
  const e: FieldErrors = { ...validateContact(f) };
  if (f.full_name.trim().length < 2) e.full_name = "Enter the full name";
  if (!RE.email.test(f.email)) e.email = "Enter a valid email address";
  if (!f.dob) e.dob = "Choose the date of birth";
  if (!f.gender) e.gender = "Choose a gender";
  if (!f.date_of_joining) e.date_of_joining = "Choose the joining date";
  if (f.dob && f.date_of_joining && f.date_of_joining < add18(f.dob)) e.dob = "The employee must be at least 18 on the joining date";
  if (!f.designation.trim()) e.designation = "Enter the designation";
  if (!f.location_id) e.location_id = "Choose a location";
  if (!f.department_id) e.department_id = "Choose a department";
  if (!RE.pan.test(f.pan)) e.pan = "PAN must be 5 letters, 4 digits, 1 letter (like ABCDE1234F)";
  if (opts.requireAadhaar && !RE.aadhaar.test(f.aadhaar)) e.aadhaar = "Aadhaar must be 12 digits";
  if (f.uan && !RE.uan.test(f.uan)) e.uan = "UAN must be 12 digits";
  if (!RE.account.test(f.account_number)) e.account_number = "Account number must be 9 to 18 digits";
  if (!RE.ifsc.test(f.ifsc)) e.ifsc = "IFSC must be 4 letters, then 0, then 6 letters or digits";
  if (!f.bank_name.trim()) e.bank_name = "Enter the bank name";
  return e;
}
