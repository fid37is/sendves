import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/**
 * Handles email links: account confirmation, password recovery and invites.
 *
 * Two link shapes arrive here:
 *  - `?token_hash=…&type=…` – works in any browser or device (use this in the Supabase email templates).
 *  - `?code=…` – the PKCE code, which only works in the same browser that started the sign-up.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (!isSupabaseConfigured) return NextResponse.redirect(`${origin}/login?error=link-invalid`);
  const supabase = createClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Link already used (some mail apps open links to scan them) but this browser is signed in: carry on.
  const { data } = await supabase.auth.getUser();
  if (data.user) return NextResponse.redirect(`${origin}${next}`);

  return NextResponse.redirect(`${origin}/login?error=link-invalid`);
}
