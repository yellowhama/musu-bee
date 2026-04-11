import { NextRequest, NextResponse } from "next/server";
import { getCompanySetup, saveCompanySetup } from "@/lib/companySetup";

function readScope(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return {
    workspaceId: searchParams.get("workspaceId"),
    userKey: searchParams.get("userKey"),
  };
}

export async function GET(req: NextRequest) {
  const state = await getCompanySetup(readScope(req));
  return NextResponse.json(state);
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as {
    companyName?: string;
    selectedProjects?: string[];
  };

  if (typeof body.companyName !== "string" || body.companyName.trim().length === 0) {
    return NextResponse.json({ error: "companyName required" }, { status: 400 });
  }

  if (!Array.isArray(body.selectedProjects) || body.selectedProjects.length === 0) {
    return NextResponse.json({ error: "selectedProjects required" }, { status: 400 });
  }

  const state = await saveCompanySetup({
    companyName: body.companyName,
    selectedProjects: body.selectedProjects,
  }, undefined, readScope(req));
  return NextResponse.json(state);
}
