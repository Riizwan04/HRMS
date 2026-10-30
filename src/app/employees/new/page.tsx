import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { aadhaarKeyConfigured } from "@/lib/crypto";
import { dateLineFor } from "@/lib/page-context";
import { PREVIEW_ENABLED } from "@/lib/preview-data";
import { getFormOptions } from "@/modules/employees";
import { NewEmployeeForm } from "./new-employee-form";

export const metadata = { title: "Add employee · Samudra" };

export default async function Page() {
  const me = await requireRole("hr", "hr");
  if (me.demo) redirect("/employees");
  const opts = await getFormOptions();
  return (
    <AppShell demo={false} liveData role={me.role} active="employees" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(false)}>
      <h1 className="mb-1 text-2xl font-semibold">Add employee</h1>
      <p className="mb-4 text-sm text-muted">The employee code is created automatically and never changes.</p>
      <NewEmployeeForm options={opts} aadhaarReady={aadhaarKeyConfigured()} />
    </AppShell>
  );
}
