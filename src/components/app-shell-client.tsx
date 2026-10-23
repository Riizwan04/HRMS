"use client";

import clsx from "clsx";
import {
  Building2, CalendarCheck, CalendarDays, CalendarRange, FileText, Home, Inbox, MessageCircle, MoreHorizontal,
  Plane, Settings, User, Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

type Role = "employee" | "manager" | "hr";
type Item = { key: string; label: string; href: string; Icon: ComponentType<{ className?: string }>; roles: Role[] };

// Menu per role (DESIGN.md section 3). The menu is a convenience: the server and the database enforce access.
const ITEMS: Item[] = [
  { key: "home", label: "Home", href: "/", Icon: Home, roles: ["employee", "manager", "hr"] },
  { key: "profile", label: "My profile", href: "/profile", Icon: User, roles: ["employee", "manager", "hr"] },
  { key: "attendance", label: "My attendance", href: "/attendance", Icon: CalendarCheck, roles: ["employee", "manager", "hr"] },
  { key: "leave", label: "My leave", href: "/leave", Icon: Plane, roles: ["employee", "manager", "hr"] },
  { key: "holidays", label: "Holidays", href: "/holidays", Icon: CalendarDays, roles: ["employee", "manager", "hr"] },
  { key: "team", label: "Team attendance", href: "/team", Icon: Users, roles: ["manager", "hr"] },
  { key: "approvals", label: "Approvals", href: "/approvals", Icon: Inbox, roles: ["manager", "hr"] },
  { key: "teamleave", label: "Leave calendar", href: "/team-leave", Icon: CalendarRange, roles: ["manager", "hr"] },
  { key: "reports", label: "Reports", href: "/reports", Icon: FileText, roles: ["manager", "hr"] },
  { key: "employees", label: "Employees", href: "/employees", Icon: Building2, roles: ["hr"] },
  { key: "settings", label: "Settings", href: "/settings", Icon: Settings, roles: ["hr"] },
];

export function AppShellClient({ role, active, enabled, userName, dateLine, userSlot, children }: {
  role: Role; active: string; enabled: string[]; userName: string; dateLine: string; userSlot?: ReactNode; children: ReactNode;
}) {
  const items = ITEMS.filter((i) => i.roles.includes(role));
  const link = (i: Item, extra = "") =>
    enabled.includes(i.key) ? (
      <Link key={i.key} href={`${i.href}?role=${role}`} aria-current={i.key === active ? "page" : undefined}
        className={clsx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", extra,
          i.key === active ? "bg-primary text-on-primary" : "text-text hover:bg-surface-2")}>
        <i.Icon className="size-5" aria-hidden /> {i.label}
      </Link>
    ) : (
      <span key={i.key} className={clsx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted opacity-60", extra)}
        title="Coming soon">
        <i.Icon className="size-5" aria-hidden /> {i.label}
        <span className="ml-auto text-[10px] uppercase tracking-wide">soon</span>
      </span>
    );

  const tabs = ["home", "attendance", "leave"].map((k) => items.find((i) => i.key === k)!);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-3 lg:flex">
        <div className="flex items-center gap-2 px-3 py-3">
          <Image src="/brand/kinara-logo.svg" alt="" width={32} height={32} />
          <span className="text-lg font-semibold">Kinara</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">{items.map((i) => link(i))}</nav>
        <div className="mt-auto border-t border-border px-3 pt-3 text-sm">
          <p className="font-medium">{userName}</p>
          <p className="text-muted capitalize">{role === "hr" ? "HR Admin" : role}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-sidebar px-4 py-3">
          <div className="flex items-center gap-2 lg:hidden">
            <Image src="/brand/kinara-logo.svg" alt="" width={28} height={28} />
            <span className="font-semibold">Kinara</span>
          </div>
          <p className="hidden text-sm text-muted sm:block">{dateLine}</p>
          <span className="rounded-full border border-warning px-2.5 py-1 text-xs font-semibold text-warning" title="Prototype screens use sample data until sign-in and the database are connected">Demo · sample data</span>
          <button type="button" disabled title="The assistant is built later"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-input px-3 text-sm font-semibold text-primary opacity-70">
            <MessageCircle className="size-4" aria-hidden /> Ask HR
          </button>
          {userSlot}
        </header>
        <p className="px-4 pt-2 text-xs text-muted sm:hidden">{dateLine}</p>
        <main className="min-w-0 flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>

      <nav aria-label="Main (phone)" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-sidebar lg:hidden">
        {tabs.map((i) => (
          <Link key={i.key} href={`${i.href}?role=${role}`} aria-current={i.key === active ? "page" : undefined}
            className={clsx("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
              i.key === active ? "text-primary" : "text-muted")}>
            <i.Icon className="size-5" aria-hidden /> {({ home: "Home", attendance: "Attendance", leave: "Leave" } as Record<string, string>)[i.key]}
          </Link>
        ))}
        <span className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted opacity-60">
          <MessageCircle className="size-5" aria-hidden /> Ask HR
        </span>
        <span className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted opacity-60">
          <MoreHorizontal className="size-5" aria-hidden /> More
        </span>
      </nav>
    </div>
  );
}
