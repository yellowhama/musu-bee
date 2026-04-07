import { NextResponse } from "next/server";
import { getSubscription, getDeviceLimit } from "@/lib/subscription";

export async function GET() {
  const [state, deviceLimit] = await Promise.all([getSubscription(), getDeviceLimit()]);
  return NextResponse.json({
    ...state,
    deviceLimit,
  });
}
