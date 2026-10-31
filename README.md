# Samudra — Konkan Coastal Foods HRMS

Employee Master, Attendance and Leave, plus an HR assistant (AI agent), for Konkan Coastal Foods (Panaji head office, Verna plant).
Built for the *HRMS Build* assignment (AI Applications in HR).

**Live app:** https://hrms-xqz4.vercel.app (sign in; dev-mode Clerk, see test logins below)

## Test logins

Sign in at the live URL. These are Clerk development test emails: if asked for a code, enter **424242**.

| Role | Email | What it can do |
|---|---|---|
| HR Admin | `riizhr+clerk_test@gmail.com` | everything: employees, settings, all reports, all approvals |
| Manager | `riizmgr+clerk_test@gmail.com` | own team: team attendance, leave calendar, approvals, team report |
| Employee | `riizemp+clerk_test@gmail.com` | own attendance, leave, profile, holidays, Ask HR |

The password is whatever was set when the user was created in Clerk. Any other email gets "You do not have access yet". Roles come from the
`employees` table, never from Clerk. The 17 other seeded people (`@kcf.example`) are data only and cannot sign in.

## What works (all on live data, no sample data)

| Area | Features |
|---|---|
| Employee Master | add employee (multi-step, Indian field validation), searchable directory with filters, profile tabs (personal, job, statutory, bank, contact and emergency, history), self-service contact edit, reporting-line loop check, deactivate with last working day, masked PAN / Aadhaar / bank, logged Reveal (never for Aadhaar), audit history |
| Attendance | check in / out (IST, one record a day), day status (Present, Half Day, Absent, On Leave, Holiday, Weekly Off, Late), WFH with manager approval, month calendar, regularisation, team attendance, holiday calendar per site with optional holidays (2 a year) |
| Leave | leave types and quotas (Settings), balances with opening / accrued / used / pending, apply with live working-day count and convert-to-LOP, approve / reject / cancel, leave calendar with clash warnings, month-end summary CSV |
| HR assistant | "Ask HR" panel: 7 required tools plus a month-end check for HR, guardrails (no approve/reject/cancel, 5-call cap, `agent_log`, no Aadhaar / PAN / bank to the model, numbers only from tools, writes only as drafts confirmed by a button), plain-English replies |
| Roles | HR Admin flag stored; Manager derived from reporting lines; checked on the server and by database row-level security |

## Not included (skipped by the owner, decision logged in ARCHITECTURE.md section 12)

- **Email notifications (L6):** requests are queued in `email_outbox`; no sender is connected (needs a Resend account and a verified domain). Managers see requests in Approvals and employees see status in My leave.
- **Medical certificate upload:** sick leave over 2 days still requires a certificate, but file upload (Vercel Blob) is not connected, so such a request cannot be submitted. Code for it is in place.
- **Research interview** (RESEARCH.md section 8): not conducted. Statutory figures in RESEARCH.md are tagged as unverified against primary texts.
- Out of scope per the brief: payroll, PF/ESI/PT/TDS, recruitment, performance, biometric, shifts, mobile app, multi-tenant.

## Run it locally

```bash
npm install
cp .env.example .env.local        # fill in the Clerk keys and DATABASE_URL (never commit it)
npm run dev                        # http://localhost:3000   (no Clerk keys = sample-data demo mode)
npm run lint && npm run typecheck
npm run test:tz                    # unit tests under 3 time zones
npm run test:db                    # database rules + security (pgTAP; needs local PostgreSQL 16 with pgTAP)
npm run test:int                   # app-to-database tests (needs the same local PostgreSQL)
npm run agent:prompts              # 22 assistant prompts against the real model (needs Neon + Gemini key)
```

### Setting up the database (Neon)

1. Apply `db/migrations/*.sql` in order (`npm run db:migrate` with `DATABASE_URL_ADMIN`, or paste them in the Neon SQL Editor).
2. Seed the three test people: `npm run db:seed` with `SEED_HR_EMAIL`, `SEED_MANAGER_EMAIL`, `SEED_EMPLOYEE_EMAIL` (must equal the Clerk users' emails).
3. Optional demo data (17 more people, 4 departments, 2026 holidays, attendance): run `db/seed/demo-data.sql` once.
4. On Vercel set `DATABASE_URL` (the limited `app_runtime` login), the two Clerk keys and `GOOGLE_GENERATIVE_AI_API_KEY`. The owner/admin URL is never set on Vercel.

Environment variables are listed, blank, in [`.env.example`](.env.example). No secrets are committed.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind) on Vercel · Neon PostgreSQL (row-level security) · Clerk (authentication only) · Vercel AI SDK with Google Gemini ·
Vitest, pgTAP, Playwright. Reasons and rejected alternatives: [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Tests

34 unit tests under 3 time zones, 188 database tests (rule IDs `DV-*`, `AR-*`, `LR-*` in the names), 89 app-to-database tests. Latest run: [`docs/test-report.txt`](docs/test-report.txt).

## Repository map

```
RESEARCH.md  ARCHITECTURE.md  DESIGN.md  CLAUDE.md   design documents (rules have IDs: LR-*, AR-*, DV-*)
db/migrations   the database: tables, rules, actions, security (one implementation of every rule)
db/tests        pgTAP tests citing the rule IDs          db/seed   demo data
src/modules     employees, attendance, leave, approvals, holidays, team, reports, settings, agent
src/lib         IST helpers (the only code allowed to touch clocks), database client, auth, crypto
src/app         the screens; docs/ screenshots (early demo-mode captures), test report, logo
```
