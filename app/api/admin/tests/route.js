import { NextResponse } from "next/server";
import { listTests, createTest, ValidationError } from "@/lib/data";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  try {
    const tests = await listTests({
      courseName: searchParams.get("courseName") || undefined,
      cohort: searchParams.get("cohort") || undefined,
    });
    return NextResponse.json({ tests });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const test = await createTest(body);
    return NextResponse.json({ test }, { status: 201 });
  } catch (err) {
    console.error(err);
    const status = err instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
