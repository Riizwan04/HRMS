# CLAUDE.md

Read this at the start of every session. Update it when Claude repeats a mistake (teach once, not in chat).

## What this project is

An HRMS for **Konkan Coastal Foods** (180 people; head office in Panaji, plant in Verna, Goa). It replaces an Excel employee sheet, a paper attendance register and WhatsApp leave approvals. Product name and logo are decided in `DESIGN.md`.

Modules: **Employee Master**, **Attendance**, **Leave**, plus one **HR assistant agent** built on top of them.
Payroll stays with an external vendor. We only produce the month-end attendance summary CSV.

Out of scope (do not build): payroll/salary, PF/ESI/PT/TDS computation, recruitment/onboarding, performance reviews, biometric/GPS, shift rosters/overtime, mobile app, multi-tenant.

## Current phase

Checkpoints 1–2 (paper only): `RESEARCH.md`, `ARCHITECTURE.md`, `DESIGN.md`, `CLAUDE.md`.
**Write NO application code** (no React/Next.js, SQL, migrations or backend setup) until the owner has signed off `ARCHITECTURE.md` and `DESIGN.md`. Sign-off is recorded in the decision log at the bottom of `ARCHITECTURE.md`.

## Source of truth (read before changing anything)

| Question | File |
|---|---|
| Business rules (leave policy, attendance rules, validation rules) | `RESEARCH.md` §10 — rules have IDs (`LR-*`, `AR-*`, `DV-*`); tests cite the IDs |
| Stack, data model, access control, where logic lives, agent design | `ARCHITECTURE.md` |
| Screens, flows, status colours, components | `DESIGN.md` — **follow it; do not invent UI** |
| Original brief | `HRMS_Requirement_Document.pdf` (provided by the owner; not committed) |

If the build must depart from `ARCHITECTURE.md`, **update `ARCHITECTURE.md` and its decision log first**, then code.

## Stack (details and rejected alternatives in ARCHITECTURE.md)

Next.js (App Router, TypeScript) on Vercel · Supabase Postgres (RLS on) · Clerk (authentication only) · Resend (email) · Vercel AI SDK + a free-tier model (Gemini, Groq fallback) · Vitest, pgTAP, Playwright.

## Non-negotiable rules

1. **All times are IST (`Asia/Kolkata`)**, stored and shown in IST regardless of server or laptop time zone. Use only the helpers in `src/lib/time/ist.ts`. Never use bare `new Date()` getters, `toLocaleString()` without an explicit zone, or client clocks for business decisions. Calendar dates (leave, holidays, attendance day) are plain `DATE` values, never JS `Date` objects.
2. **Never commit secrets.** No keys, tokens, `.env*` (except `.env.example` with blank values). Use `.env.local` and Vercel env vars. Never commit a `.env` file or run database resets/destructive migrations without the owner's explicit approval.
3. **Role checks are enforced on the server and in the database** (`requireEmployee` → `requireRole` / object-level check → RLS/RPC). Hiding a button is never a control. A user's role comes from the `employees` table, never from Clerk claims. Only `is_hr_admin` is stored; **Manager is derived** (someone's `reporting_manager_id` for ≥1 active employee). No separate manager accounts.
4. **Sensitive data**: Aadhaar, PAN and bank numbers are masked in every screen, API response, log and CSV. Aadhaar is never shown unmasked anywhere. Raw statutory/bank tables are never selected directly by the app; use the masked views/RPCs. Never send these values to the AI model, not even masked.
5. **One implementation of each business rule**, in the database (working-day count, day status, leave balance, apply/approve/cancel). UI, CSV and agent tools call it; TypeScript must not re-implement it.
6. **AI agent**: acts as the signed-in user, uses the same server functions and role checks, has no service key/DB credentials, every write is a draft a human confirms by button, numbers come from tools only, max 5 tool calls per question, every call logged to `agent_log`.
7. **Employee code never changes** and is never reused. Employees are deactivated, never deleted.
8. **Tests before features.** Turn each testing-checklist item (brief p.19–20) into an automated test first, then implement. Cite rule IDs in test names.
9. Keep changes small; read every diff before committing; commit per checkpoint with a clear message and push to the designated branch.

## Working style in Claude Code

- Start every build checkpoint (3–12) in plan mode; compare the plan with `ARCHITECTURE.md` before approving.
- After writing code, be ready to explain any rule implemented (e.g. how working days are counted).
- Use a reviewer subagent (checks diffs against `ARCHITECTURE.md` + business rules) and a tester subagent (writes tests from the checklist).
- Do not build out-of-scope features before the core scope passes the checklist.

## Folder rules (full tree in ARCHITECTURE.md §9)

Code is organised **by module** under `src/modules/{employees,attendance,leave,reports,agent}`; shared code in `src/lib`. Modules may import `src/lib` and each other's public `index.ts` only — never another module's internals. Database changes only via files in `supabase/migrations`. Seed via `scripts/seed.ts`.

## Commands

TBD at Checkpoint 3 (fresh setup). Add install/dev/test/lint commands here as soon as they exist.
