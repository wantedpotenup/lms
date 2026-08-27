// 로그인 세션 처리. 이름/생년월일이나 관리자 비밀번호를 URL이나 평문 쿠키에
// 노출하지 않기 위해, 서명된 JWT를 httpOnly 쿠키에 담아 사용한다.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const MEMBER_COOKIE = "session";
export const ADMIN_COOKIE = "admin_session";

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET 환경변수가 설정되어 있지 않습니다. 임의의 긴 문자열을 설정해주세요."
    );
  }
  return new TextEncoder().encode(secret);
}

async function sign(payload, expires) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(getSecretKey());
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload;
  } catch {
    return null;
  }
}

export async function createMemberToken(memberId) {
  return sign({ role: "member", memberId }, "12h");
}

export async function createAdminToken() {
  return sign({ role: "admin" }, "12h");
}

// --- 서버 컴포넌트 / 서버 액션에서 쓰는 헬퍼 (next/headers 의 cookies() 사용) ---

export async function getMemberSession() {
  const store = await cookies();
  const token = store.get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "member") return null;
  return payload;
}

export async function getAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") return null;
  return payload;
}

// --- API 라우트(NextRequest)에서 쓰는 헬퍼 ---

export async function getMemberSessionFromRequest(request) {
  const token = request.cookies.get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "member") return null;
  return payload;
}

export async function getAdminSessionFromRequest(request) {
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload || payload.role !== "admin") return null;
  return payload;
}
