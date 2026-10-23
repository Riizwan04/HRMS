import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk-config";
import { sample } from "@/lib/preview-data";

/** Name shown in the shell and greeting: the signed-in Clerk user when sign-in is on, else the demo person. */
export async function displayName(): Promise<string> {
  if (!clerkEnabled) return sample.user.name;
  const u = await currentUser();
  return u?.fullName?.trim() || u?.firstName?.trim() || u?.primaryEmailAddress?.emailAddress || sample.user.name;
}
