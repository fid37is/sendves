import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/ui/confirm";
import { FormActions } from "@/components/ui/form-actions";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/submit-button";
import { EmptyRow, Table, TD, TH } from "@/components/ui/table";
import { SELF_SERVE_PLANS } from "@/config/plan-limits";
import { planName } from "@/config/plans";
import { describePromo, type PromoRow } from "@/lib/promo";
import { requireAdminDb } from "@/lib/auth/admin";
import { formatNumber } from "@/lib/utils";
import { createPromoAction, setPromoActiveAction } from "../actions";

export const metadata: Metadata = { title: "Promo codes" };

const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");

export default async function AdminPromosPage() {
  const { db } = await requireAdminDb();
  const { data } = await db.from("promo_codes").select("id, code, description, percent_off, duration, duration_months, plans, interval, starts_at, expires_at, max_redemptions, redeemed_count, active, created_at")
    .order("created_at", { ascending: false }).limit(200);
  const promos = (data ?? []) as (PromoRow & { description: string | null })[];

  return (
    <>
      <PageHeader title="Promo codes" description="Percentage-off codes customers enter on the Billing page when they subscribe. Each account can use a code once." />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          <Table>
            <thead><tr><TH>Code</TH><TH>Discount</TH><TH>Applies to</TH><TH>Used</TH><TH>Valid</TH><TH className="w-28"><span className="sr-only">Actions</span></TH></tr></thead>
            <tbody>
              {promos.map((p) => {
                const ended = p.expires_at && new Date(p.expires_at).getTime() <= Date.now();
                const full = p.max_redemptions !== null && p.redeemed_count >= p.max_redemptions;
                return (
                  <tr key={p.id}>
                    <TD label="Code"><span className="font-semibold text-ink">{p.code}</span>{p.description ? <p className="text-xs text-ink-muted">{p.description}</p> : null}</TD>
                    <TD label="Discount">{describePromo(p)}</TD>
                    <TD label="Applies to">{p.plans && p.plans.length ? p.plans.map(planName).join(", ") : "All plans"}{p.interval ? `, ${p.interval === "year" ? "annual" : "monthly"} only` : ""}</TD>
                    <TD label="Used">{formatNumber(p.redeemed_count)}{p.max_redemptions !== null ? ` of ${formatNumber(p.max_redemptions)}` : ""}</TD>
                    <TD label="Valid">
                      {!p.active ? <Badge tone="neutral">Off</Badge> : ended ? <Badge tone="danger">Expired</Badge> : full ? <Badge tone="warning">Fully used</Badge> : <Badge tone="success">Live</Badge>}
                      {p.starts_at || p.expires_at ? <p className="mt-1 text-xs text-ink-muted">{day(p.starts_at) || "now"} to {day(p.expires_at) || "no end"}</p> : null}
                    </TD>
                    <TD>
                      <ConfirmSubmitButton
                        action={setPromoActiveAction}
                        fields={{ id: p.id, active: p.active ? "0" : "1" }}
                        confirm={{ title: p.active ? `Turn off ${p.code}?` : `Turn on ${p.code}?`, description: p.active ? "Customers won’t be able to apply it any more. People who already used it keep their discount." : "Customers will be able to apply it again.", confirmLabel: p.active ? "Turn off" : "Turn on", tone: p.active ? "danger" : "default" }}
                        variant="outline" size="sm"
                      >
                        {p.active ? "Turn off" : "Turn on"}
                      </ConfirmSubmitButton>
                    </TD>
                  </tr>
                );
              })}
              {promos.length === 0 ? <EmptyRow cols={6} message="No promo codes yet. Create the first one." /> : null}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="New promo code" description="Stripe applies the full terms. Paystack takes the discount off the first payment only, then charges the normal price." />
          <form action={createPromoAction} className="space-y-5 p-6">
            <Field label="Code" htmlFor="code" hint="Letters, numbers, - and _, 3 to 32 characters.">
              <Input id="code" name="code" required maxLength={32} placeholder="LAUNCH20" autoComplete="off" />
            </Field>
            <Field label="Note for the team" htmlFor="description"><Input id="description" name="description" maxLength={120} placeholder="Launch week, social giveaway" /></Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Percent off" htmlFor="percent"><Input id="percent" name="percent" type="number" min={1} max={100} required defaultValue={20} /></Field>
              <Field label="For how long" htmlFor="duration">
                <Select id="duration" name="duration" defaultValue="once">
                  <option value="once">First payment only</option>
                  <option value="repeating">A number of months</option>
                  <option value="forever">Every payment</option>
                </Select>
              </Field>
              <Field label="Months" htmlFor="months" hint="Only for “a number of months”."><Input id="months" name="months" type="number" min={1} max={36} placeholder="3" /></Field>
              <Field label="Billing" htmlFor="interval">
                <Select id="interval" name="interval" defaultValue="">
                  <option value="">Monthly and annual</option>
                  <option value="month">Monthly only</option>
                  <option value="year">Annual only</option>
                </Select>
              </Field>
            </div>
            <Field label="Plans" htmlFor="plan_starter" hint="Leave all ticked for every plan.">
              <div className="flex flex-wrap gap-4 pt-1 text-sm">
                {SELF_SERVE_PLANS.map((id) => (
                  <label key={id} className="flex items-center gap-2"><input id={`plan_${id}`} type="checkbox" name="plans" value={id} defaultChecked />{planName(id)}</label>
                ))}
              </div>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Starts" htmlFor="starts"><Input id="starts" name="starts" type="date" /></Field>
              <Field label="Ends" htmlFor="ends"><Input id="ends" name="ends" type="date" /></Field>
            </div>
            <Field label="Maximum uses" htmlFor="max" hint="Empty means unlimited."><Input id="max" name="max" type="number" min={1} placeholder="100" /></Field>
            <FormActions><ActionButton>Create code</ActionButton></FormActions>
          </form>
        </Card>
      </div>
    </>
  );
}
