import { UserButton } from "@clerk/nextjs";
import type { ComponentProps } from "react";
import { clerkEnabled } from "@/lib/clerk-config";
import { AppShellClient } from "./app-shell-client";

/**
 * Server wrapper: decides on the server (using BOTH Clerk keys, same rule as the proxy and the provider) whether
 * to show the user menu. Deciding in the browser from the public key alone crashed pages when only that key was set.
 */
export function AppShell(props: Omit<ComponentProps<typeof AppShellClient>, "userSlot">) {
  return <AppShellClient {...props} userSlot={clerkEnabled ? <UserButton /> : null} />;
}
