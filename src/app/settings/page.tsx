import { AppShell } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { PREVIEW_ENABLED } from "@/lib/preview-data";
import { getFormOptions } from "@/modules/employees";
import { getSettings } from "@/modules/settings";
import { SettingsView } from "./settings-view";

export const metadata = { title: "Settings · Kinara" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("hr", sp.role ?? "hr");
  const data = me.demo ? null : await getSettings();
  const states = me.demo ? [] : (await getFormOptions()).states;
  return (
    <AppShell demo={me.demo} liveData={!me.demo} role={me.role} active="settings" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(me.demo)}>
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      {data ? <SettingsView data={data} states={states} /> : (
        <Card><CardBody className="py-10 text-center text-sm text-muted">Settings need the live database. Sign in as an HR Admin to use them.</CardBody></Card>)}
    </AppShell>
  );
}
