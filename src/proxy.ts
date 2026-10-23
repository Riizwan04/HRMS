// Next.js 16 "proxy" (formerly middleware). Gate (1) of the access-control chain in ARCHITECTURE.md section 2:
// "is there a signed-in Clerk session?". Authorisation (who may see what) is enforced by the server and the database.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { clerkEnabled } from "@/lib/clerk-config";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/about"]);

export default clerkEnabled
  ? clerkMiddleware(
      async (auth, req) => {
        if (!isPublic(req)) await auth.protect();
      },
      { signInUrl: "/sign-in", signUpUrl: "/sign-up" },
    )
  : function proxy() {
      return NextResponse.next(); // demo mode: no keys, no gate
    };

export const config = {
  matcher: [
    // Skip Next internals and static files; always run for API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
