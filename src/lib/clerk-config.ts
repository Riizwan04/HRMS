// Sign-in switches on only when BOTH Clerk keys exist. Without them the app opens straight to the dashboard (demo mode),
// so a missing key can never break a deployment. The publishable key is inlined at build time; the secret key is server-only.
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

/** Clerk widgets styled for the navy theme (DESIGN.md 2.1). */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#2dd4bf",
    colorBackground: "#112547",
    colorText: "#eaf0fa",
    colorTextSecondary: "#a9bad6",
    colorInputBackground: "#0a1a33",
    colorInputText: "#eaf0fa",
    colorNeutral: "#eaf0fa",
    colorTextOnPrimaryBackground: "#04213a",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-inter), system-ui, sans-serif",
  },
} as const;
