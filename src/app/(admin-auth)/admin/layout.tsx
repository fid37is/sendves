import { Logo } from "@/components/ui/logo";
import { ShieldCheck } from "lucide-react";

/** Sign-in and 2FA pages: no console chrome, so nothing about the console is visible before sign-in. */
export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-night px-5 py-12">
      <Logo href="/login" light />
      <div className="mt-10 w-full max-w-md rounded-3xl border border-accent-200 bg-white p-8 shadow-2xl shadow-night/40 sm:p-10">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent-100 px-3 py-1 text-xs font-bold text-night">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Administrator access
        </p>
        {children}
      </div>
      <p className="mt-6 text-xs text-white/60">Access is logged. Unauthorised use is prohibited.</p>
    </main>
  );
}
