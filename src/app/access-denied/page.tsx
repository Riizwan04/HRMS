import { SignOutButton } from "@clerk/nextjs";
import Image from "next/image";
import { clerkEnabled } from "@/lib/clerk-config";

export const metadata = { title: "No access · Samudra" };

export default function AccessDenied() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-5 py-10">
      <Image src="/brand/samudra-logo.svg" alt="" width={44} height={44} />
      <h1 className="text-2xl font-semibold">You do not have access yet</h1>
      <p className="leading-7 text-muted">
        You are signed in, but this email is not linked to an active employee record at Konkan Coastal Foods.
        Please ask HR to add or reactivate you using the same email address, then sign in again.
      </p>
      {clerkEnabled && (
        <SignOutButton redirectUrl="/sign-in">
          <button type="button" className="h-11 w-fit rounded-lg bg-primary px-5 text-sm font-semibold text-on-primary">Sign out</button>
        </SignOutButton>
      )}
    </main>
  );
}
