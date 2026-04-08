import { NextResponse } from "next/server";
import {
  getSubscription,
  getDeviceLimit,
  toPublicSubscriptionState,
} from "@/lib/subscription";

export async function GET() {
  const [state, deviceLimit] = await Promise.all([getSubscription(), getDeviceLimit()]);
  const publicState = toPublicSubscriptionState(state);
  return NextResponse.json({
    ...publicState,
    deviceLimit,
  });
}
