import { NextResponse } from "next/server";
import { updateMember, deleteMember, NotFoundError, ValidationError } from "@/lib/data";

function errorStatus(err) {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ValidationError) return 400;
  return 500;
}

export async function PUT(request, { params }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const member = await updateMember(id, body);
    return NextResponse.json({ member });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: errorStatus(err) });
  }
}

export async function DELETE(_request, { params }) {
  const { id } = await params;
  try {
    await deleteMember(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: errorStatus(err) });
  }
}
