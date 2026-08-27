import { NextResponse } from "next/server";
import { findMemberByNameAndBirth } from "@/lib/data";
import { createMemberToken, MEMBER_COOKIE } from "@/lib/auth";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { name, birth } = body || {};
  if (!name || !birth) {
    return NextResponse.json({ error: "이름과 생년월일을 입력해주세요." }, { status: 400 });
  }

  let member;
  try {
    member = await findMemberByNameAndBirth(name, birth);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }

  if (!member) {
    return NextResponse.json(
      { error: "이름 또는 생년월일이 일치하는 구성원 정보를 찾을 수 없습니다." },
      { status: 401 }
    );
  }

  const token = await createMemberToken(member["구성원ID"]);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MEMBER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
