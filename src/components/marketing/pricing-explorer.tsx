"use client";

import { useState } from "react";
import { AudienceSlider } from "@/components/billing/audience-slider";
import { PlanCards } from "@/components/marketing/plan-cards";
import { DEFAULT_AUDIENCE, type BillingInterval } from "@/config/plan-limits";

/** The pricing page's slider and plan cards: moving the slider reprices every plan on the page. */
export function PricingExplorer({ interval }: { interval: BillingInterval }) {
  const [audience, setAudience] = useState(DEFAULT_AUDIENCE);
  return (
    <>
      <div className="mx-auto mb-8 max-w-2xl rounded-3xl border border-mist bg-white p-6">
        <AudienceSlider value={audience} onChange={setAudience} />
      </div>
      <PlanCards interval={interval} audience={audience} />
    </>
  );
}
