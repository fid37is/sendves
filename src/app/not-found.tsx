import { ButtonLink } from "@/components/ui/button";
import { EnvelopeIcon } from "@/components/motion/envelope";
import { SpeedLines } from "@/components/motion/speed-lines";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white px-6 text-center">
      <SpeedLines tone="light" />
      <div className="relative">
        <div className="mx-auto mb-8 flex h-24 w-24 animate-bob items-center justify-center rounded-3xl bg-brand-700 shadow-xl shadow-brand-700/30" aria-hidden="true">
          <EnvelopeIcon className="w-14" />
        </div>
        <p className="text-sm font-semibold text-brand-800">Error 404</p>
        <h1 className="mt-3 text-4xl font-extrabold text-ink sm:text-5xl">This page didn’t arrive</h1>
        <p className="mx-auto mt-4 max-w-md text-ink-soft">The page you’re looking for has moved or doesn’t exist. Head back home and try again.</p>
        <ButtonLink href="/" className="mt-8">Back to home</ButtonLink>
      </div>
    </main>
  );
}
