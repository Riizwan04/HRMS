import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireEmployee } from "@/lib/auth";
import { aadhaarKeyConfigured } from "@/lib/crypto";
import { dateLineFor } from "@/lib/page-context";
import { PREVIEW_ENABLED } from "@/lib/preview-data";
import { getAudit, getFormOptions, getProfile } from "@/modules/employees";
import { ProfileView } from "./profile-view";

export const metadata = { title: "Profile · Samudra" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireEmployee();
  if (me.demo || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const profile = await getProfile(id);
  if (!profile) notFound();              // a guessed id looks exactly like a missing page
  const isHr = me.role === "hr";
  const [options, audit] = await Promise.all([getFormOptions(), isHr ? getAudit(id) : Promise.resolve([])]);
  const self = me.id === id;
  return (
    <AppShell demo={false} liveData role={me.role} active={self ? "profile" : "employees"} enabled={PREVIEW_ENABLED} userName={me.name} dateLine={dateLineFor(false)}>
      <ProfileView profile={profile} options={options} audit={audit} isHr={isHr} isSelf={self} aadhaarReady={aadhaarKeyConfigured()} justCreated={sp.created ?? null} />
    </AppShell>
  );
}
