import { NextResponse } from "next/server";
import { updateTestResult, deleteTestResult, NotFoundError, ValidationError } from "@/lib/data";

function errorStatus(err) {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ValidationError) return 400;
  return 500;
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const result = await updateTestResult(id, body);
    return NextResponse.json({ result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: errorStatus(err) });
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  try {
    await deleteTestResult(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: errorStatus(err) });
  }
}
