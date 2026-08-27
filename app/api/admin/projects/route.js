import { NextResponse } from "next/server";
import { listProjects, createProject, ValidationError } from "@/lib/data";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  try {
    const projects = await listProjects({
      memberId: searchParams.get("memberId") || undefined,
    });
    return NextResponse.json({ projects });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const project = await createProject(body);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error(err);
    const status = err instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
