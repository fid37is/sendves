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
  admin: {
    /** Admins must pass a second factor (TOTP). Set ADMIN_REQUIRE_MFA=false only for local development. */
    requireMfa: process.env.ADMIN_REQUIRE_MFA !== "false",
    /** Optional comma-separated IP allowlist for the admin host, e.g. "203.0.113.4,198.51.100.0". */
    allowedIps: (process.env.ADMIN_ALLOWED_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  },
  billing: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    stripePrices: {
      starter: process.env.STRIPE_PRICE_STARTER ?? "",
      growth: process.env.STRIPE_PRICE_GROWTH ?? "",
    } as Record<string, string>,
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
    paystackAmounts: {
      starter: Number(process.env.PAYSTACK_AMOUNT_STARTER ?? 0),
      growth: Number(process.env.PAYSTACK_AMOUNT_GROWTH ?? 0),
    } as Record<string, number>,
    paystackPlans: {
      starter: process.env.PAYSTACK_PLAN_STARTER ?? "",
      growth: process.env.PAYSTACK_PLAN_GROWTH ?? "",
    } as Record<string, string>,
  },
  limits: {
    newWorkspaceDailySendLimit: Number(process.env.NEW_WORKSPACE_DAILY_SEND_LIMIT ?? 200),
    newWorkspaceMaxContacts: Number(process.env.NEW_WORKSPACE_MAX_CONTACTS ?? 500),
  },
};
