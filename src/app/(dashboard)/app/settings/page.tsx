import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsLayout, SettingsSection, type SettingsNavItem } from "@/components/ui/settings-layout";
import { ActionButton } from "@/components/ui/submit-button";
import { FormActions } from "@/components/ui/form-actions";
import { FactList } from "@/components/ui/tabs";
import { CompanyLogoField } from "@/components/dashboard/company-logo-field";
import { can, ROLE_LABEL } from "@/lib/access";
import { FOOTER_TEXT_MAX, isTimeZone, TIME_ZONES } from "@/lib/company";
import { DEFAULT_BRAND_COLOR, DEFAULT_FOOTER_TEXT, EMPTY_LOGO } from "@/lib/email/campaign";
import { getContext } from "@/lib/workspace";
import { getEmailLogo } from "@/server/email-assets";
import { updateBrandAction, updateCompanyAction, updateEmailDefaultsAction, updateProfileAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await getContext();
  const ws = ctx?.workspace ?? null;
  const owner = can(ctx?.access, "org.settings");

  const logo = ws && ctx?.db ? await getEmailLogo(ctx.db, ws.id) : EMPTY_LOGO;

  // A workspace saved before the structured address existed has one line of text: show it in the first field so
  // saving the form doesn't lose it.
  const hasParts = Boolean(ws?.address_line1 || ws?.address_city || ws?.address_country);
  const line1 = hasParts ? ws?.address_line1 ?? "" : ws?.business_address ?? "";

  const zones: string[] = [...TIME_ZONES];
  if (ws?.timezone && !zones.includes(ws.timezone) && isTimeZone(ws.timezone)) zones.unshift(ws.timezone);

  const sections: SettingsNavItem[] = owner
    ? [
        { id: "company", label: "Company", hint: "Name, contact, address" },
        { id: "branding", label: "Branding", hint: "Logo and colour" },
        { id: "email", label: "Email defaults", hint: "Time zone, footer" },
        { id: "account", label: "Your account", hint: "Name and sign-in" },
      ]
    : [
        { id: "company", label: "Company", hint: "Read only" },
        { id: "account", label: "Your account", hint: "Name and sign-in" },
      ];

  return (
    <>
      <PageHeader title="Settings" description="Your company details, branding and sign-in. Campaigns pick the company details up automatically." />
      <SettingsLayout sections={sections}>
        {/* ── Company ───────────────────────────────────────────────── */}
        {owner ? (
          <SettingsSection id="company" title="Company" description="Who you are and where you are. The address is printed at the bottom of every email, as anti-spam laws require.">
            {!ws?.business_address ? (
              <p role="status" className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
                Add your business address below. You can’t send a campaign without it.
              </p>
            ) : null}
            <Card>
              <CardHeader title="Business details" />
              <form action={updateCompanyAction}>
                <div className="space-y-5 p-6">
                  <Field label="Business name" htmlFor="business"><Input id="business" name="business" defaultValue={ws?.name} maxLength={80} required autoComplete="organization" /></Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Website" htmlFor="website" hint="Optional."><Input id="website" name="website" type="text" inputMode="url" defaultValue={ws?.company_website ?? ""} placeholder="https://example.com" autoComplete="url" /></Field>
                    <Field label="Contact email" htmlFor="companyEmail" hint="Optional. Shown to readers who want to reach you."><Input id="companyEmail" name="companyEmail" type="email" defaultValue={ws?.company_email ?? ""} placeholder="hello@example.com" /></Field>
                    <Field label="Phone" htmlFor="phone" hint="Optional."><Input id="phone" name="phone" type="tel" defaultValue={ws?.company_phone ?? ""} placeholder="+234 801 234 5678" autoComplete="tel" /></Field>
                  </div>
                </div>
                <div className="border-t border-mist p-6">
                  <p className="text-sm font-bold text-ink">Business address</p>
                  <p className="mt-1 text-xs text-ink-muted">A street, a city and a country are needed. Everything else is optional.</p>
                  <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2"><Field label="Street address" htmlFor="line1"><Input id="line1" name="line1" defaultValue={line1} maxLength={120} autoComplete="address-line1" /></Field></div>
                    <div className="sm:col-span-2"><Field label="Suite, floor or building" htmlFor="line2"><Input id="line2" name="line2" defaultValue={ws?.address_line2 ?? ""} maxLength={120} autoComplete="address-line2" /></Field></div>
                    <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={ws?.address_city ?? ""} maxLength={80} autoComplete="address-level2" /></Field>
                    <Field label="State or region" htmlFor="region"><Input id="region" name="region" defaultValue={ws?.address_region ?? ""} maxLength={80} autoComplete="address-level1" /></Field>
                    <Field label="Postal code" htmlFor="postalCode"><Input id="postalCode" name="postalCode" defaultValue={ws?.address_postal_code ?? ""} maxLength={20} autoComplete="postal-code" /></Field>
                    <Field label="Country" htmlFor="country"><Input id="country" name="country" defaultValue={ws?.address_country ?? ""} maxLength={80} autoComplete="country-name" /></Field>
                  </div>
                  <FormActions className="mt-6"><ActionButton requireChange>Save company details</ActionButton></FormActions>
                </div>
              </form>
            </Card>
          </SettingsSection>
        ) : (
          <SettingsSection id="company" title="Company" description="Only an owner can change these.">
            <Card>
              <CardHeader title={ws?.name ?? "Your organization"} />
              <FactList
                items={[
                  { label: "Your role", value: ctx?.access ? ROLE_LABEL[ctx.access.role] : "" },
                  { label: "Website", value: ws?.company_website ?? "" },
                  { label: "Contact email", value: ws?.company_email ?? "" },
                  { label: "Phone", value: ws?.company_phone ?? "" },
                  { label: "Business address", value: ws?.business_address ?? "" },
                ]}
              />
            </Card>
          </SettingsSection>
        )}

        {/* ── Branding ──────────────────────────────────────────────── */}
        {owner ? (
          <SettingsSection id="branding" title="Branding" description="Every new campaign starts with this logo and colour. You can still change them inside a campaign.">
            <Card>
              <CardHeader title="Logo and colour" />
              <form action={updateBrandAction} className="space-y-6 p-6">
                <CompanyLogoField initial={logo} />
                <div>
                  <Field label="Brand colour" htmlFor="brandColor" hint="Used for buttons and links. Leave it on the default if you’re not sure.">
                    <input id="brandColor" name="brandColor" type="color" defaultValue={ws?.brand_color ?? DEFAULT_BRAND_COLOR}
                      className="h-11 w-20 cursor-pointer rounded-xl border border-mist bg-white p-1 hover:border-ink/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
                  </Field>
                </div>
                <FormActions><ActionButton>Save branding</ActionButton></FormActions>
              </form>
            </Card>
          </SettingsSection>
        ) : null}

        {/* ── Email defaults ────────────────────────────────────────── */}
        {owner ? (
          <SettingsSection id="email" title="Email defaults" description="How campaigns behave unless you change them for one campaign.">
            <Card>
              <CardHeader title="Defaults" />
              <form action={updateEmailDefaultsAction} className="space-y-5 p-6">
                <Field label="Time zone" htmlFor="tz" hint="Used for scheduling and for the dates in your reports.">
                  <Select id="tz" name="tz" defaultValue={ws?.timezone ?? "Africa/Lagos"}>
                    {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                  </Select>
                </Field>
                <Field label="Footer line" htmlFor="footer" hint={`Sits above your address in new campaigns. Leave empty to use “${DEFAULT_FOOTER_TEXT}”`}>
                  <Textarea id="footer" name="footer" rows={3} maxLength={FOOTER_TEXT_MAX} defaultValue={ws?.email_footer_text ?? ""} placeholder={DEFAULT_FOOTER_TEXT} className="min-h-[88px]" />
                </Field>
                <label className="flex items-start gap-3 text-sm text-ink-soft">
                  <input type="checkbox" name="trackOpens" defaultChecked={ws?.track_opens ?? true} className="mt-0.5 h-4 w-4 accent-brand-700" />
                  Track opens. Opens are unreliable because mail apps can hide them; click tracking stays on either way.
                </label>
                <FormActions><ActionButton requireChange>Save email defaults</ActionButton></FormActions>
              </form>
            </Card>
          </SettingsSection>
        ) : null}

        {/* ── Your account ──────────────────────────────────────────── */}
        <SettingsSection id="account" title="Your account" description="Your own details. Only you see these.">
          <Card>
            <CardHeader title="Profile" />
            <form action={updateProfileAction} className="space-y-5 p-6">
              <Field label="Full name" htmlFor="fullName"><Input id="fullName" name="fullName" defaultValue={ctx?.user.fullName} autoComplete="name" /></Field>
              <Field label="Email address" htmlFor="email" hint="Used to sign in and to recover your account."><Input id="email" type="email" defaultValue={ctx?.user.email} readOnly /></Field>
              <FormActions><ActionButton requireChange>Save profile</ActionButton></FormActions>
            </form>
          </Card>
        </SettingsSection>
      </SettingsLayout>
    </>
  );
}