import clsx from "clsx";

/** Loading placeholder shaped like the final content (DESIGN.md section 7). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-md bg-border/60", className)} />;
}
