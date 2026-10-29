import { Check } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { SpeedLines } from "@/components/motion/speed-lines";
import { FlyingEnvelopes } from "@/components/motion/envelope";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1fr_0.9fr]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="animate-rise">{children}</div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <SpeedLines />
        <FlyingEnvelopes />
        <div className="relative mx-auto max-w-md">
          <h2 className="animate-rise text-4xl font-extrabold leading-tight" style={{ animationDelay: "0.1s" }}>Email that moves with you.</h2>
          <p className="animate-rise mt-4 text-accent-100" style={{ animationDelay: "0.2s" }}>Send campaigns your audience wants, with the protection your sender reputation needs.</p>
          <ul className="mt-8 space-y-4">
            {["Free plan, no credit card", "Guided domain authentication", "Unsubscribe and bounce handling built in"].map((t, i) => (
              <li key={t} className="animate-rise flex items-center gap-3 text-accent-100" style={{ animationDelay: `${0.35 + i * 0.12}s` }}>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-400">
                  <Check className="h-4 w-4 text-brand-900" aria-hidden="true" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
