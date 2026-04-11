import { NextRequest, NextResponse } from "next/server";

import { getCompanyActivation, applyCompanyActivation } from "@/lib/companyActivation";
import { getCompanySetup } from "@/lib/companySetup";

function readScope(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return {
    workspaceId: searchParams.get("workspaceId"),
    userKey: searchParams.get("userKey"),
  };
}

export async function GET(req: NextRequest) {
  const activation = await getCompanyActivation(readScope(req));
  return NextResponse.json({ activation });
}

export async function POST(req: NextRequest) {
  const scope = readScope(req);
  const setup = await getCompanySetup(scope);
  const activation = await applyCompanyActivation(setup, undefined, scope);
  return NextResponse.json({ activation });
}
