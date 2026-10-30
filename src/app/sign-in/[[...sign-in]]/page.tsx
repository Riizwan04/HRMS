import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import { redirect } from "next/navigation";
import { clerkEnabled } from "@/lib/clerk-config";

export const metadata = { title: "Sign in · Samudra" };

export default function Page() {
  if (!clerkEnabled) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <Image src="/brand/samudra-logo.svg" alt="" width={48} height={48} />
        <div><h1 className="text-2xl font-semibold">Samudra</h1><p className="text-sm text-muted">Konkan Coastal Foods · People, simply.</p></div>
      </div>
      <SignIn />
    </main>
  );
}
