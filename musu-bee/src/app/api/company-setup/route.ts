import { NextRequest, NextResponse } from "next/server";
import { getCompanySetup, saveCompanySetup } from "@/lib/companySetup";

export async function GET() {
  const state = await getCompanySetup();
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
  });
  return NextResponse.json(state);
}
