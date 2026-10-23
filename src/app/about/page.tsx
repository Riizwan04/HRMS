import { CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Kinara · Konkan Coastal Foods HRMS" };

const WORKING = [
  { href: "/", title: "Home dashboard", note: "Check in and see leave balances at a glance. Employee, Manager and HR Admin views." },
  { href: "/leave/apply", title: "Apply for leave", note: "Live working-days calculator: weekends and holidays skipped, balance after, convert to Loss of Pay, certificate rule." },
  { href: "/leave", title: "My leave", note: "Balances with full breakdown, request history, confirmed cancel." },
  { href: "/attendance", title: "My attendance", note: "Colour-coded month calendar, Late marks, regularisation and WFH requests." },
  { href: "/approvals", title: "Approvals inbox", note: "Leave, regularisation, WFH and optional-holiday requests; comment rules; failure handling." },
  { href: "/holidays", title: "Holiday calendar", note: "Panaji (5-day) and Verna (6-day) calendars, optional holidays with a 2-a-year limit." },
];
const SOON = ["Team attendance and leave calendar", "Employee directory, profile and add employee", "Reports (month-end CSV) and settings", "HR assistant (AI agent)", "Sign-in and live database connection"];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-5 py-10">
      <header className="flex items-center gap-4">
        <Image src="/brand/kinara-logo.svg" alt="" width={56} height={56} />
        <div>
          <h1 className="text-3xl font-semibold">Kinara</h1>
          <p className="text-muted">Konkan Coastal Foods HRMS · People, simply.</p>
        </div>
      </header>

      <p className="rounded-lg border border-border bg-surface p-4 text-sm leading-6">
        <strong>Project status: work in progress.</strong> The screens below are working prototypes that run on <strong>sample data</strong>;
        sign-in and the live database connection are the next milestone. The business rules behind them (leave balances, working days,
        attendance status, approvals, access control) are already built in the database and verified by
        <strong> 188 automated tests</strong>, which you can run from the repository.
      </p>

      <section aria-labelledby="working">
        <h2 id="working" className="mb-3 text-lg font-semibold">Ready to try</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {WORKING.map((w) => (
            <li key={w.href}>
              <Link href={w.href} className="flex h-full flex-col gap-1 rounded-lg border border-border bg-surface p-4 hover:border-primary">
                <span className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-success" aria-hidden /> {w.title}</span>
                <span className="text-sm text-muted">{w.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="soon">
        <h2 id="soon" className="mb-3 text-lg font-semibold">Coming next</h2>
        <ul className="flex flex-col gap-2 text-sm text-muted">
          {SOON.map((s) => <li key={s} className="flex items-center gap-2"><CircleDashed className="size-4" aria-hidden /> {s}</li>)}
        </ul>
      </section>

      <footer className="flex flex-wrap gap-4 border-t border-border pt-4 text-sm">
        <Link className="font-semibold text-primary underline" href="/">Open the app</Link>
        <a className="inline-flex items-center gap-1 text-primary underline" href="https://github.com/Riizwan04/HRMS" target="_blank" rel="noreferrer">
          Source code and documents on GitHub <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </footer>
    </main>
  );
}
