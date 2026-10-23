// SAMPLE DATA for the /preview pages only. Removed when the screens are wired to the database.
export type Role = "employee" | "manager" | "hr";

export const sample = {
  user: { name: "Asha Naik", code: "KCF0007", location: "Panaji Head Office" },
  nowIso: "2026-10-16T04:28:00Z", // Fri 16 Oct 2026, 9:58 am IST
  checkInIso: "2026-10-16T04:28:00Z",
  balances: [
    { code: "CL", name: "Casual Leave", available: 6.0, pending: 2.0 },
    { code: "SL", name: "Sick Leave", available: 7.0, pending: 0 },
    { code: "EL", name: "Earned Leave", available: 11.25, pending: 0 },
  ],
  pending: [
    { id: "1", kind: "Leave", text: "CL · 22–23 Oct · 2 days" },
    { id: "2", kind: "WFH", text: "Mon 19 Oct" },
  ],
  team: { present: 6, wfh: 1, leave: 1, notIn: 1, decisions: 3 },
  org: { active: 178, onLeave: 7, absent: 4, invites: 2, missingOut: 3 },
};
