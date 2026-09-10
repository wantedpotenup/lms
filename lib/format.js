// 여러 곳에서 공통으로 쓰는 값 변환/판별 유틸리티 모음.

export function normalizeDigits(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

// 생년월일 비교 전용 정규화 함수.
// "1996-02-09", "19960209", "96.02.09", "960209" 처럼 연도를 4자리로
// 쓰든 2자리로 쓰든 같은 날짜면 같은 값으로 취급되도록, 숫자만 뽑은 뒤
// 6자리(YYMMDD)면 앞에 세기(19 또는 20)를 붙여 8자리(YYYYMMDD)로
// 통일한다. 두 자리 연도가 50보다 크면 1900년대, 50 이하면 2000년대로
// 본다 (학습자 연령대를 고려한 값으로, 대부분의 실제 생년에 맞다).
export function normalizeBirthDate(value) {
  const digits = normalizeDigits(value);
  if (digits.length === 6) {
    const yy = Number(digits.slice(0, 2));
    const century = yy <= 50 ? "20" : "19";
    return `${century}${digits}`;
  }
  return digits;
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
