import { NextResponse } from "next/server";
import { createAdminToken, ADMIN_COOKIE } from "@/lib/auth";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { password } = body || {};
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { error: "서버에 ADMIN_PASSWORD 환경변수가 설정되어 있지 않습니다." },
      { status: 500 }
    );
  }
  // Vercel에 환경변수를 붙여넣을 때 앞뒤에 의도치 않은 공백/줄바꿈이
  // 섞여 들어가는 경우가 흔해서, 비교 전에 양쪽 다 trim 해서 그런
  // 사소한 이유로 로그인이 막히는 일을 줄인다.
  if (String(password ?? "").trim() !== String(adminPassword).trim()) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const token = await createAdminToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
