import { NextResponse } from "next/server";
import { getSubscription, getDeviceLimit } from "@/lib/subscription";

export async function GET() {
  const state = getSubscription();
  return NextResponse.json({
    ...state,
    deviceLimit: getDeviceLimit(),
  });
}
