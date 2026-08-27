import { NextResponse } from "next/server";
import { listMembers, createMember, ValidationError } from "@/lib/data";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  try {
    const members = await listMembers({
      courseName: searchParams.get("courseName") || undefined,
      cohort: searchParams.get("cohort") || undefined,
      keyword: searchParams.get("keyword") || undefined,
    });
    return NextResponse.json({ members });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const member = await createMember(body);
    return NextResponse.json({ member }, { status: 201 });
  } catch (err) {
    console.error(err);
    const status = err instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
