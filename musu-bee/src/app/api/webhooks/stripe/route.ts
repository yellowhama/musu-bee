import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSubscription, saveSubscription } from "@/lib/subscription";
import type { PlanTier } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not set" },
      { status: 500 }
    );
  }
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.arrayBuffer();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      Buffer.from(rawBody),
      sig,
      webhookSecret
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;

      const tier = (session.metadata?.tier ?? "pro") as PlanTier;
      const current = await getSubscription();
      await saveSubscription({
        ...current,
        plan: tier,
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: session.subscription as string,
        status: "active",
      });
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const current = await getSubscription();
      if (current.stripeSubscriptionId !== sub.id) break;

      const status = sub.status === "active" || sub.status === "trialing"
        ? sub.status
        : "cancelled";
      await saveSubscription({
        ...current,
        status,
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const current = await getSubscription();
      if (current.stripeSubscriptionId !== sub.id) break;

      await saveSubscription({
        ...current,
        plan: "free",
        status: "cancelled",
        stripeSubscriptionId: null,
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
