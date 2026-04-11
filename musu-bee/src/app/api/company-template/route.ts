import { NextResponse } from "next/server";
import { defaultCompanyTemplate } from "@/lib/templates/defaultCompanyTemplate";

export async function GET() {
  return NextResponse.json(defaultCompanyTemplate);
}
