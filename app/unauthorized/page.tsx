import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center text-ink">
      <div className="card-editorial w-full max-w-md p-10">
        <span className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-red-200 bg-red-50">
          <ShieldAlert className="h-6 w-6 text-red-600" />
        </span>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Access restricted
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/65">
          Your account role does not grant access to this portal. Coal-Intel
          keeps executive and subsidiary workstreams strictly isolated — sign
          in with an account provisioned for this view.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login?portal=executive" className="btn-pill">
            Executive sign-in
          </Link>
          <Link href="/login?portal=subsidiary" className="btn-pill-secondary">
            Subsidiary sign-in
          </Link>
        </div>
      </div>
    </main>
  );
}
