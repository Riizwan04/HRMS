import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <Image src="/brand/kinara-logo.svg" alt="" width={64} height={64} />
      <h1 className="text-3xl font-semibold">Kinara</h1>
      <p className="text-muted">Konkan Coastal Foods HRMS. People, simply.</p>
      <Link href="/preview/dashboard" className="rounded-lg bg-primary px-5 py-3 font-semibold text-white hover:bg-primary-dark">
        See the dashboard preview
      </Link>
      <p className="text-xs text-muted">Preview pages use sample data until sign-in and the database are connected.</p>
    </main>
  );
}
