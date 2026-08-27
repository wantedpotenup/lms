import { NextResponse } from "next/server";
import { listTestResults, getTestResultWithQuestions, createTestResult, ValidationError, NotFoundError } from "@/lib/data";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const resultId = searchParams.get("resultId");
  try {
    if (resultId) {
      const data = await getTestResultWithQuestions(resultId);
      return NextResponse.json(data);
    }
    const results = await listTestResults({
      testId: searchParams.get("testId") || undefined,
      memberId: searchParams.get("memberId") || undefined,
    });
    return NextResponse.json({ results });
  } catch (err) {
    console.error(err);
    const status = err instanceof NotFoundError ? 404 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await createTestResult(body);
    return NextResponse.json({ result }, { status: 201 });
  } catch (err) {
    console.error(err);
    const status = err instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
