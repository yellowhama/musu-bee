import { NextRequest, NextResponse } from "next/server";

import {
  getCompanyActivation,
  getCompanyRegistry,
  applyCompanyActivation,
  setActiveCompany,
  deleteCompany,
  syncCompanyActivation,
} from "@/lib/companyActivation";
import { getCompanySetup } from "@/lib/companySetup";

function readScope(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return {
    workspaceId: searchParams.get("workspaceId"),
    userKey: searchParams.get("userKey"),
  };
}

export async function GET(req: NextRequest) {
  const scope = readScope(req);
  const [activation, registry] = await Promise.all([
    getCompanyActivation(scope),
    getCompanyRegistry(scope),
  ]);
  return NextResponse.json({ activation, registry });
}

export async function POST(req: NextRequest) {
  const scope = readScope(req);
  const setup = await getCompanySetup(scope);
  const { activation, registry } = await applyCompanyActivation(setup, undefined, scope);
  return NextResponse.json({ activation, registry });
}

export async function PATCH(req: NextRequest) {
  const scope = readScope(req);
  const body = (await req.json()) as {
    action?: "activate" | "sync";
    companyId?: string;
  };

  if (!body.companyId || typeof body.companyId !== "string") {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  if (body.action === "activate") {
    const registry = await setActiveCompany(body.companyId, scope);
    const activation = registry.companies.find((entry) => entry.companyId === registry.activeCompanyId) ?? null;
    return NextResponse.json({ activation, registry });
  }

  if (body.action === "sync") {
    const { activation, registry } = await syncCompanyActivation(body.companyId, scope);
    return NextResponse.json({ activation, registry });
  }

  return NextResponse.json({ error: "unsupported action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const scope = readScope(req);
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const registry = await deleteCompany(companyId, scope);
  const activation = await getCompanyActivation(readScope(req));
  return NextResponse.json({ activation, registry });
}
