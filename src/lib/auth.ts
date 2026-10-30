import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { clerkEnabled } from "@/lib/clerk-config";
import { systemSql, withUser } from "@/lib/db/client";
import { sample } from "@/lib/preview-data";

export type Role = "employee" | "manager" | "hr";
export type Me = { id: string; name: string; role: Role; locationName: string; demo: boolean };

/** Role comes from the employees table only (CLAUDE.md rule 3): HR flag stored, Manager derived from reports. */
export function roleOf(isHrAdmin: boolean, isManager: boolean): Role {
  return isHrAdmin ? "hr" : isManager ? "manager" : "employee";
}

const DEMO_ROLES: Role[] = ["employee", "manager", "hr"];

/**
 * Gate 2 of ARCHITECTURE.md section 2. Returns the signed-in employee or null (not linked, inactive, past last day,
 * database not configured). The database decides (whoami() is empty for anyone it does not recognise).
 * With no Clerk keys the app runs as a local sample-data demo, where `requested` (?role=) picks the view.
 */
export const getMe = cache(async (requested?: string): Promise<Me | null> => {
  if (!clerkEnabled) {
    const role = DEMO_ROLES.find((r) => r === requested) ?? "employee";
    return { id: "demo", name: sample.user.name, role, locationName: "Panaji Head Office", demo: true };
  }
  if (!process.env.DATABASE_URL) return null; // fail closed: no database, no access

  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  const email = user?.primaryEmailAddress;
  if (email?.verification?.status === "verified") {
    // First login only: link this Clerk user to the employee row that has the same verified email.
    await systemSql()`select public.link_clerk_user(${userId}, ${email.emailAddress.toLowerCase()})`;
  }
  const [[row]] = await withUser({ sub: userId }, (q) => [q`select public.whoami() as me`]);
  const me = row?.me as { id: string; full_name: string; is_hr_admin: boolean; is_manager: boolean; location_name: string } | null | undefined;
  if (!me) return null;
  return { id: me.id, name: me.full_name, role: roleOf(me.is_hr_admin, me.is_manager), locationName: me.location_name, demo: false };
});

export async function requireEmployee(requested?: string): Promise<Me> {
  const me = await getMe(requested);
  if (!me) redirect("/access-denied");
  return me;
}

const RANK: Record<Role, number> = { employee: 0, manager: 1, hr: 2 };

/** Server-side route guard. Hiding a menu item is never the control; this is. */
export async function requireRole(min: Role, requested?: string): Promise<Me> {
  const me = await requireEmployee(requested);
  if (RANK[me.role] < RANK[min]) redirect("/");
  return me;
}
