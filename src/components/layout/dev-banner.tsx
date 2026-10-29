import { env } from "@/lib/env";

/** Reminds you which test switches are on. Renders nothing once both are off. */
export function DevBanner() {
  if (!env.demoMode && !env.sampleData) return null;
  return (
    <p className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {env.demoMode ? "Demo mode is on: sign-in is bypassed. " : ""}
      {env.sampleData ? "Sample data is on: the stats, contacts, campaigns and users shown are fake. " : ""}
      Set {[env.demoMode ? "NEXT_PUBLIC_DEMO_MODE" : "", env.sampleData ? "NEXT_PUBLIC_SAMPLE_DATA" : ""].filter(Boolean).join(" and ")} to false to go live.
    </p>
  );
}
