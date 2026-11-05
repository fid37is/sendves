/**
 * Server-only secrets. Import this file only from server code (server actions, route
 * handlers, the worker). It intentionally does not use the "server-only" package so the
 * standalone worker (npm run worker) can import it too. These variables have no
 * NEXT_PUBLIC_ prefix, so Next.js never bundles them into browser code.
 */
if (typeof window !== "undefined") {
  throw new Error("env.server.ts was imported into browser code. Server secrets must never reach the client.");
}

export const serverEnv = {
  appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  appSecret: process.env.APP_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  /**
   * Optional. The address Sendves itself sends from (team invitations), e.g. "Sendves <no-reply@sendves.com>".
   * It must be a verified identity in your email provider. Without it, invitations still work: the
   * invite link is shown on the Team page to copy and share.
   */
  platformFrom: process.env.PLATFORM_FROM_EMAIL ?? "",
  sending: {
    provider: (process.env.SENDING_PROVIDER ?? "console") as "console" | "ses",
    ratePerSecond: Math.max(1, Number(process.env.SEND_RATE_PER_SECOND ?? 5)),
  },
  aws: {
    region: process.env.AWS_REGION ?? "",
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    sesConfigurationSet: process.env.SES_CONFIGURATION_SET ?? "",
    sesWebhookSecret: process.env.SES_WEBHOOK_SECRET ?? "",
    /** Optional but recommended: only accept SNS messages from this topic. */
    snsTopicArn: process.env.SES_SNS_TOPIC_ARN ?? "",
  },
  /**
   * Replies. Every email carries a Reply-To on this domain, which Sendves owns (e.g. reply.sendves.com), so a
   * customer's own mailboxes are never touched. Leave INBOUND_DOMAIN empty to turn the inbox's receiving side off:
   * emails then go out without a Reply-To and replies land wherever they did before.
   */
  inbound: {
    domain: (process.env.INBOUND_DOMAIN ?? "").trim().toLowerCase().replace(/^@/, ""),
    webhookSecret: process.env.INBOUND_WEBHOOK_SECRET ?? "",
    /** Optional but recommended: only accept messages from this SNS topic. */
    snsTopicArn: process.env.INBOUND_SNS_TOPIC_ARN ?? "",
    /** The S3 bucket SES stores received mail in. Mail is only read from this bucket. */
    s3Bucket: process.env.INBOUND_S3_BUCKET ?? "",
  },
  admin: {
    /** Admins must pass a second factor (TOTP). Set ADMIN_REQUIRE_MFA=false only for local development. */
    requireMfa: process.env.ADMIN_REQUIRE_MFA !== "false",
    /** Optional comma-separated IP allowlist for the admin host, e.g. "203.0.113.4,198.51.100.0". */
    allowedIps: (process.env.ADMIN_ALLOWED_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  },
  billing: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    // One entry per plan and billing interval ("starter", "starter_year", ...). Annual entries stay empty until annual billing is switched on.
    stripePrices: {
      starter: process.env.STRIPE_PRICE_STARTER ?? "",
      growth: process.env.STRIPE_PRICE_GROWTH ?? "",
      pro: process.env.STRIPE_PRICE_PRO ?? "",
      starter_year: process.env.STRIPE_PRICE_STARTER_YEAR ?? "",
      growth_year: process.env.STRIPE_PRICE_GROWTH_YEAR ?? "",
      pro_year: process.env.STRIPE_PRICE_PRO_YEAR ?? "",
    } as Record<string, string>,
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
    // Smallest currency unit (kobo for NGN). Also used to work out the prorated upgrade charge.
    paystackAmounts: {
      starter: Number(process.env.PAYSTACK_AMOUNT_STARTER ?? 0),
      growth: Number(process.env.PAYSTACK_AMOUNT_GROWTH ?? 0),
      pro: Number(process.env.PAYSTACK_AMOUNT_PRO ?? 0),
      starter_year: Number(process.env.PAYSTACK_AMOUNT_STARTER_YEAR ?? 0),
      growth_year: Number(process.env.PAYSTACK_AMOUNT_GROWTH_YEAR ?? 0),
      pro_year: Number(process.env.PAYSTACK_AMOUNT_PRO_YEAR ?? 0),
    } as Record<string, number>,
    paystackPlans: {
      starter: process.env.PAYSTACK_PLAN_STARTER ?? "",
      growth: process.env.PAYSTACK_PLAN_GROWTH ?? "",
      pro: process.env.PAYSTACK_PLAN_PRO ?? "",
      starter_year: process.env.PAYSTACK_PLAN_STARTER_YEAR ?? "",
      growth_year: process.env.PAYSTACK_PLAN_GROWTH_YEAR ?? "",
      pro_year: process.env.PAYSTACK_PLAN_PRO_YEAR ?? "",
    } as Record<string, string>,
    paystackCurrency: (process.env.PAYSTACK_CURRENCY ?? "").trim().toUpperCase(),
    // Smallest currency units per 1 USD (kobo per dollar for NGN; 100 when the Paystack currency is USD). Audience prices are in USD
    // and Paystack charges are worked out from it. Paystack stays switched off until this is set.
    paystackUnitsPerUsd: Number(process.env.PAYSTACK_UNITS_PER_USD ?? 0),
  },
  limits: {
    newWorkspaceDailySendLimit: Number(process.env.NEW_WORKSPACE_DAILY_SEND_LIMIT ?? 200),
    newWorkspaceMaxContacts: Number(process.env.NEW_WORKSPACE_MAX_CONTACTS ?? 500),
  },
};
