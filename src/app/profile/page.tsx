import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth";
import { dateLineFor } from "@/lib/page-context";
import { PREVIEW_ENABLED } from "@/lib/preview-data";

export const metadata = { title: "My profile · Samudra" };

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const me = await requireEmployee(sp.role);
  if (!me.demo) redirect(`/employees/${me.id}`);
  return (
    <AppShell demo role={me.role} active="profile" enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(true)}>
      <h1 className="mb-4 text-2xl font-semibold">My profile</h1>
      <Card><CardBody className="py-10 text-center text-sm text-muted">Your profile appears here once you sign in with a real account.</CardBody></Card>
    </AppShell>
  );
}
