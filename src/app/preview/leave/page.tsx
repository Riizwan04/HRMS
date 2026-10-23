import { redirect } from "next/navigation";

// "My leave" is built in a later step; until then this opens Apply leave.
export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  redirect(`/preview/leave/apply${sp.role ? `?role=${sp.role}` : ""}`);
}
