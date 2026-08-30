import { NextResponse } from "next/server";
import { createAdminToken, ADMIN_COOKIE } from "@/lib/auth";

// 제로폭 공백/조인터, BOM 등 눈에 안 보이는 유니코드 문자들. 복사/붙여넣기
// 과정에서 섞여 들어와도 눈으로는 구분이 안 되기 때문에, 비교 전에 모두
// 제거해서 "화면엔 똑같아 보이는데 로그인이 안 되는" 문제를 줄인다.
const INVISIBLE_CHARS_RE = /[\u200B\u200C\u200D\uFEFF]/g;

function sanitizeSecret(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(INVISIBLE_CHARS_RE, "")
    .trim();
}

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
  const inputClean = sanitizeSecret(password);
  const envClean = sanitizeSecret(adminPassword);
  if (inputClean !== envClean) {
    // 실제 값은 절대 로그로 남기지 않고, 길이만 남겨서 (Vercel의 Runtime Logs
    // 에서만 확인 가능) "복사할 때 글자가 더 붙었나/빠졌나"를 진단할 수 있게 한다.
    console.error(
      `[admin-login] 비밀번호 불일치 (입력 길이=${inputClean.length}, 설정값 길이=${envClean.length})`
    );
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
