// Sign-in switches on only when BOTH Clerk keys exist. Without them the app opens straight to the dashboard (demo mode),
// so a missing key can never break a deployment. The publishable key is inlined at build time; the secret key is server-only.
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/** Clerk widgets styled for the Slate and Sky theme (DESIGN.md 2.1). */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#38bdf8",
    colorBackground: "#182130",
    colorText: "#eef3fa",
    colorTextSecondary: "#a7b3c6",
    colorInputBackground: "#10151d",
    colorInputText: "#eef3fa",
    colorNeutral: "#eef3fa",
    colorTextOnPrimaryBackground: "#04202f",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-inter), system-ui, sans-serif",
  },
} as const;
