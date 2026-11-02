"use server";

import { revalidatePath } from "next/cache";
import { checkBrandColor, checkCompany, cleanText, FOOTER_TEXT_MAX, formatAddress, isTimeZone } from "@/lib/company";
import { DEFAULT_BRAND_COLOR, sanitizeLogo } from "@/lib/email/campaign";
import { go } from "@/lib/flash";
import { requireWorkspace } from "@/lib/workspace";
import { assetRule, getEmailLogo, saveEmailLogo } from "@/server/email-assets";

const BACK = "/app/settings";
const text = (f: FormData, k: string, max: number) => cleanText(f.get(k), max);

/** Where to return to, so the page lands on the section that was just saved. */
const back = (section: string) => `${BACK}#${section}`;

/** Postgres says this when migration 0010 hasn't been run yet. */
const missingColumns = (message: string | undefined) => Boolean(message && /column .* does not exist|schema cache/i.test(message));
const SETUP_HINT = "Settings can’t be saved yet: the database needs its latest update (migration 0010). Ask whoever manages Sendves to run it.";

export async function updateProfileAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK);
  const fullName = text(formData, "fullName", 100);
  if (fullName.length < 2) go(back("account"), "err", "Enter your full name.");

  const { error } = await ctx.db.from("profiles").update({ full_name: fullName }).eq("id", ctx.user.id);
  if (error) go(back("account"), "err", "Couldn’t save your profile. Try again.");

  revalidatePath("/app", "layout"); // the name also appears in the app shell
  go(back("account"), "ok", "Profile saved.");
}

/** Business name, contact details and address. The address is also stored as the one line every email footer prints. */
export async function updateCompanyAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "org.settings");
  const checked = checkCompany({
    name: formData.get("business"), website: formData.get("website"), email: formData.get("companyEmail"), phone: formData.get("phone"),
    line1: formData.get("line1"), line2: formData.get("line2"), city: formData.get("city"), region: formData.get("region"),
    postalCode: formData.get("postalCode"), country: formData.get("country"),
  });
  if (!checked.ok) go(back("company"), "err", checked.error);
  const c = checked.value;

  const { error } = await ctx.db.from("workspaces").update({
    name: c.name,
    company_website: c.website || null,
    company_email: c.email || null,
    company_phone: c.phone || null,
    address_line1: c.line1 || null,
    address_line2: c.line2 || null,
    address_city: c.city || null,
    address_region: c.region || null,
    address_postal_code: c.postalCode || null,
    address_country: c.country || null,
    business_address: formatAddress(c) || null,
  }).eq("id", ctx.workspace.id);
  if (error) go(back("company"), "err", missingColumns(error.message) ? SETUP_HINT : "Couldn’t save your company details. Try again.");

  revalidatePath("/app", "layout");
  go(back("company"), "ok", "Company details saved. New campaigns use them automatically.");
}

/** The logo and the colour new campaigns start with. */
export async function updateBrandAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "org.settings");
  const logo = sanitizeLogo(
    { src: String(formData.get("logoSrc") ?? ""), align: formData.get("logoAlign"), size: formData.get("logoSize"), w: Number(formData.get("logoW")), h: Number(formData.get("logoH")) },
    assetRule(ctx.workspace.id), // only pictures stored for this workspace are accepted
  );
  const colour = checkBrandColor(formData.get("brandColor"), DEFAULT_BRAND_COLOR);
  if (!colour.ok) go(back("branding"), "err", colour.error);

  const current = await getEmailLogo(ctx.db, ctx.workspace.id);
  if (JSON.stringify(current) !== JSON.stringify(logo) && !(await saveEmailLogo(ctx.db, ctx.workspace.id, logo))) {
    go(back("branding"), "err", "Couldn’t save the logo. Try again.");
  }
  const { error } = await ctx.db.from("workspaces").update({ brand_color: colour.value }).eq("id", ctx.workspace.id);
  if (error) go(back("branding"), "err", missingColumns(error.message) ? SETUP_HINT : "Couldn’t save the brand colour. Try again.");

  revalidatePath("/app", "layout");
  go(back("branding"), "ok", "Branding saved. New campaigns start with your logo and colour.");
}

/** Time zone, the footer line new campaigns start with, and open tracking. */
export async function updateEmailDefaultsAction(formData: FormData) {
  const ctx = await requireWorkspace(BACK, "org.settings");
  const tz = String(formData.get("tz") ?? "");
  if (!isTimeZone(tz)) go(back("email"), "err", "Choose a time zone from the list.");
  const footer = text(formData, "footer", FOOTER_TEXT_MAX);

  const { error } = await ctx.db.from("workspaces").update({
    timezone: tz,
    track_opens: formData.get("trackOpens") === "on",
    email_footer_text: footer || null,
  }).eq("id", ctx.workspace.id);
  if (error) go(back("email"), "err", missingColumns(error.message) ? SETUP_HINT : "Couldn’t save the email defaults. Try again.");

  revalidatePath("/app", "layout");
  go(back("email"), "ok", "Email defaults saved.");
}
