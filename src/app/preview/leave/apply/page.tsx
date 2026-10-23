import { AppShell } from "@/components/app-shell";
import { formatDateTimeIST } from "@/lib/time/ist";
import { leaveScenarios, sample, type Role } from "@/lib/preview-data";
import { ApplyForm } from "./apply-form";

export const metadata = { title: "Apply for leave (preview) · Kinara" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const role: Role = sp.role === "manager" || sp.role === "hr" ? sp.role : "employee";
  return (
    <AppShell role={role} active="leave" enabled={["home", "leave"]} userName={sample.user.name} dateLine={formatDateTimeIST(sample.nowIso)}>
      <h1 className="mb-4 text-2xl font-semibold">Apply for leave</h1>
      <ApplyForm scenarios={leaveScenarios} manager="Mohan Manager" />
    </AppShell>
  );
}
