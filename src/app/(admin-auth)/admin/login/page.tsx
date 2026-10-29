import type { Metadata } from "next";
import { AdminLoginForm } from "../forms";

export const metadata: Metadata = { title: "Admin sign in", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-ink">Sign in</h1>
      <p className="mb-6 mt-2 text-sm text-ink-soft">Use your administrator credentials. You’ll be asked for a second factor next.</p>
      <AdminLoginForm />
    </>
  );
}
