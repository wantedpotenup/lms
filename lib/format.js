// 여러 곳에서 공통으로 쓰는 값 변환/판별 유틸리티 모음.

export function normalizeDigits(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

export function isPublicValue(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "공개" || v === "true" || v === "y" || v === "yes";
}

export function todayStr() {
  // Google Sheets 표시값과 맞추기 위해 YYYY-MM-DD 형식의 문자열로 통일한다.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function questionNumberValue(q) {
  const match = String(q ?? "").match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

export function sortByQuestionNumber(rows, field = "문항번호") {
  return [...rows].sort(
    (a, b) => questionNumberValue(a[field]) - questionNumberValue(b[field])
  );
}

export function toNumber(value, fallback = 0) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

export function isDeducted(question) {
  const flag = String(question["감점여부"] ?? "").trim().toLowerCase();
  if (flag === "y" || flag === "yes" || flag === "true" || flag === "감점") return true;
  if (flag === "n" || flag === "no" || flag === "false") return false;
  // 명시적으로 표시되지 않았다면 획득점수가 배점보다 낮은 경우를 감점 문항으로 간주한다.
  return toNumber(question["획득점수"]) < toNumber(question["배점"]);
}

export function generateId(prefix) {
  const raw = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
    .toString()
    .replace(/-/g, "");
  return `${prefix}-${raw.slice(0, 10)}`;
}
