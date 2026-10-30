import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { as } from "@/test/int-helpers";
import { createEmployee, deactivateEmployee, getAudit, getFormOptions, getProfile, listEmployees, revealField, saveContact, updateBank, updateJob, updateStatutory, type EmployeeForm } from "./index";

vi.mock("@/lib/auth", async () => (await import("@/test/int-helpers")).authMock());
process.env.AADHAAR_ENCRYPTION_KEY = randomBytes(32).toString("base64");

let opts: Awaited<ReturnType<typeof getFormOptions>>;
const form = (over: Partial<EmployeeForm> = {}): EmployeeForm => ({
  full_name: "Nisha Prabhu", email: "nisha.prabhu@example.in", dob: "1994-05-12", gender: "female", date_of_joining: "2026-10-01", designation: "Executive", salary_grade: "G3",
  location_id: opts.locations.find((l) => l.name.startsWith("Panaji"))!.id, department_id: opts.departments[0].id, reporting_manager_id: "", is_hr_admin: false,
  mobile: "9876501234", address_line1: "12 Church Road", address_line2: "", city: "Panaji", state_code: "GA", pin_code: "403001", ec_name: "Ravi Prabhu", ec_relationship: "Brother", ec_mobile: "9876501235",
  pan: "ABCDE1234F", aadhaar: "123456789012", uan: "", account_number: "123456789012", ifsc: "HDFC0001234", bank_name: "HDFC Bank", ...over,
});
let newId: string, newCode: string;
beforeAll(async () => { as("hr"); opts = await getFormOptions(); });

describe("E1 add employee (DV-1, DV-4, DV-5, DV-7, DV-10)", () => {
  it("HR adds an employee; the code is generated; the employee appears in the directory", async () => {
    as("hr");
    const r = await createEmployee(form({ reporting_manager_id: opts.managers.find((m) => m.name === "Mohan Manager")!.id }));
    expect(r).toMatchObject({ ok: true, code: expect.stringMatching(/^KCF\d{4,}$/) });
    newId = (r as { id: string }).id; newCode = (r as { code: string }).code;
    expect((await listEmployees({ q: "Nisha" })).map((e) => e.code)).toContain(newCode);
  });
  it("DV-1/DV-4/DV-5/DV-7: bad PAN, IFSC, mobile and under-18 are refused with field messages", async () => {
    as("hr");
    const r = await createEmployee(form({ email: "bad@example.in", pan: "ABC123", ifsc: "HDFC1234567", mobile: "987654321", dob: "2009-10-05" }));
    expect(r).toMatchObject({ ok: false });
    expect((r as { fields: Record<string, string> }).fields).toMatchObject({ pan: expect.any(String), ifsc: expect.any(String), mobile: expect.any(String), dob: expect.stringContaining("18") });
  });
  it("a duplicate email is refused in plain words", async () => {
    as("hr");
    expect(await createEmployee(form())).toEqual({ ok: false, error: "An employee with this email already exists" });
  });
  it("an employee cannot add employees", async () => {
    as("emp1");
    expect(await createEmployee(form({ email: "x1@example.in" }))).toEqual({ ok: false, error: "Only HR can do that" });
  });
});

describe("E7 masked data and E3 profile access (LR-22)", () => {
  it("the profile shows PAN, Aadhaar and bank masked; no raw value is in the object", async () => {
    as("hr");
    const p = (await getProfile(newId))!;
    expect(p).toMatchObject({ pan: "ABCDE****F", aadhaar: "XXXX XXXX 9012", account: expect.stringMatching(/9012$/), ifsc: "HDFC0001234" });
    const text = JSON.stringify(p);
    expect(text).not.toContain("123456789012");
    expect(text).not.toContain("ABCDE1234F");
  });
  it("an employee sees their own profile, but a guessed id for someone else returns nothing", async () => {
    as("emp1");
    const own = (await getProfile((await listEmployeesAsHr()).find((e) => e.name === "Asha Naik")!.id))!;
    expect(own).toMatchObject({ name: "Asha Naik", pan: "ABCDE****F", aadhaar: "XXXX XXXX 1234", manager: "Mohan Manager" });
    expect(await getProfile(newId)).toBeNull();
  });
  it("the directory is limited by row-level security for non-HR (only themselves)", async () => {
    as("emp1");
    expect((await listEmployees({ status: "all" })).map((e) => e.name)).toEqual(["Asha Naik"]);
  });
});
async function listEmployeesAsHr() { const prev = (await import("@/test/int-helpers")).current.who; as("hr"); const r = await listEmployees({ status: "all" }); as(prev as "emp1"); return r; }

describe("E2 directory search and filters", () => {
  it("searches by name and code, and filters by location and status", async () => {
    as("hr");
    expect((await listEmployees({ q: newCode })).map((e) => e.name)).toEqual(["Nisha Prabhu"]);
    const verna = opts.locations.find((l) => l.name.startsWith("Verna"))!.id;
    expect((await listEmployees({ locationId: verna })).map((e) => e.name)).toEqual(["Meena Plant Manager", "Pavan Fal"]);
    expect(await listEmployees({ q: "Nisha", status: "inactive" })).toEqual([]);
  });
});

describe("E5 self-service edit and E4 job fields (DV-9)", () => {
  it("an employee edits their own contact details; an invalid mobile is refused", async () => {
    as("emp2");
    const id = (await listEmployeesAsHr()).find((e) => e.name === "Ravi Kamat")!.id;
    as("emp2");
    const base = { id, address_line1: "5 Market Road", address_line2: "", city: "Margao", state_code: "GA", pin_code: "403601", ec_name: "Sita Kamat", ec_relationship: "Wife", ec_mobile: "9876500001" };
    expect(await saveContact({ ...base, mobile: "9123456789" })).toEqual({ ok: true });
    expect((await getProfile(id))!.contact).toMatchObject({ mobile: "9123456789", city: "Margao", ecName: "Sita Kamat" });
    expect(await saveContact({ ...base, mobile: "12345" })).toMatchObject({ ok: false, fields: { mobile: expect.any(String) } });
  });
  it("job fields are read-only for the employee: updateJob is refused", async () => {
    as("emp1");
    const id = (await listEmployeesAsHr()).find((e) => e.name === "Asha Naik")!.id;
    as("emp1");
    expect(await updateJob({ id, designation: "Director", salary_grade: "G9", department_id: opts.departments[0].id, reporting_manager_id: "", is_hr_admin: false })).toEqual({ ok: false, error: "Only HR can do that" });
  });
  it("DV-9: HR cannot make someone report to their own report", async () => {
    as("hr");
    const mgr = opts.managers.find((m) => m.name === "Mohan Manager")!.id;
    const emp = opts.managers.find((m) => m.name === "Asha Naik")!.id;
    const r = await updateJob({ id: mgr, designation: "Manager", salary_grade: "G5", department_id: opts.departments[0].id, reporting_manager_id: emp, is_hr_admin: false });
    expect(r).toEqual({ ok: false, error: "That reporting line would create a loop (someone would report to themselves)" });
  });
});

describe("E8 audit trail", () => {
  it("a job change records who changed what, the old and the new value", async () => {
    as("hr");
    expect(await updateJob({ id: newId, designation: "Senior Executive", salary_grade: "G4", department_id: opts.departments[0].id, reporting_manager_id: "", is_hr_admin: false })).toEqual({ ok: true });
    const a = (await getAudit(newId)).find((x) => x.field === "designation")!;
    expect(a).toMatchObject({ oldValue: "Executive", newValue: "Senior Executive", by: "Hema HR" });
  });
  it("statutory and bank edits are audited and the audit shows masked values only", async () => {
    as("hr");
    expect(await updateStatutory({ id: newId, pan: "ZZZZZ9999Z", uan: "", aadhaar: "" })).toEqual({ ok: true });
    expect(await updateBank({ id: newId, account_number: "998877665544", ifsc: "SBIN0001234", bank_name: "SBI" })).toEqual({ ok: true });
    const text = JSON.stringify(await getAudit(newId));
    expect(text).not.toContain("ZZZZZ9999Z");
    expect(text).not.toContain("998877665544");
  });
  it("non-HR cannot read an audit trail", async () => {
    as("emp1");
    expect(await getAudit(newId)).toEqual([]);
  });
});

describe("Reveal (LR-22): PAN and bank only, logged; Aadhaar never", () => {
  it("HR reveals the PAN; it is logged; an employee and the Aadhaar field are refused", async () => {
    as("hr");
    expect(await revealField({ id: newId, field: "pan" })).toEqual({ ok: true, value: "ZZZZZ9999Z" });
    expect((await getAudit(newId)).some((x) => x.action === "reveal")).toBe(true);
    expect(await revealField({ id: newId, field: "aadhaar" as "pan" })).toMatchObject({ ok: false });
    as("emp1");
    expect(await revealField({ id: newId, field: "pan" })).toEqual({ ok: false, error: "Only HR can do that" });
  });
});

describe("E6 deactivate (exit)", () => {
  it("HR sets a last working day; the record is kept and shows inactive; HR cannot deactivate themselves", async () => {
    as("hr");
    expect(await deactivateEmployee({ id: newId, lastWorkingDay: "2026-10-31" })).toEqual({ ok: true });
    expect(await getProfile(newId)).toMatchObject({ status: "inactive", lastWorkingDay: "2026-10-31" });
    expect((await listEmployees({ q: "Nisha", status: "all" })).length).toBe(1);   // never deleted
    const hrId = (await listEmployees({ status: "all" })).find((e) => e.name === "Hema HR")!.id;
    expect(await deactivateEmployee({ id: hrId, lastWorkingDay: "2026-10-31" })).toEqual({ ok: false, error: "You can't deactivate yourself" });
  });
  it("a manager with active reports cannot be deactivated", async () => {
    as("hr");
    const mgr = opts.managers.find((m) => m.name === "Mohan Manager")!.id;
    expect(await deactivateEmployee({ id: mgr, lastWorkingDay: "2026-10-31" })).toEqual({ ok: false, error: "This person still has active reports. Move them to another manager first" });
  });
});
