// 여러 곳에서 공통으로 쓰는 값 변환/판별 유틸리티 모음.

export function normalizeDigits(value) {
  return String(value ?? "").replace(/[^0-9]/g, "");
}

// 생년월일 값에서 연/월/일을 뽑아낸다. 사람마다, 혹은 구글 시트가 값을
// 날짜/숫자로 자동인식했는지 여부에 따라 아래처럼 표기가 제각각일 수
// 있는데 최대한 다 알아듣도록 한다.
//  - 구분자가 있는 경우: "1996-02-09", "96.02.09", "1996년 2월 9일",
//    구글 시트가 날짜로 자동인식해서 "1996. 2. 9"나 "2/9/1996"처럼
//    표시하는 경우까지 (네 자리 연도가 어디에 있는지로 순서를 판단한다).
//  - 구분자가 없는 경우: "19960209"(8자리) 또는 "961229"(6자리).
//    구글 시트가 순수 숫자로 인식해서 맨 앞의 0을 지워버린 경우
//    (예: "030805" -> 30805, 2003년생처럼 두 자리 연도가 0으로
//    시작하는 사람들에게 실제로 생기는 문제)까지 대비해 5자리도
//    6자리로 보정한다.
// 알아낼 수 없으면 null을 돌려준다.
function parseBirthDateParts(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const sepParts = raw.split(/[^0-9]+/).filter(Boolean);
  let year;
  let month;
  let day;

  if (sepParts.length >= 3) {
    const yearIdx = sepParts.findIndex((p) => p.length === 4);
    if (yearIdx === -1 || yearIdx === 0) {
      // 네 자리 연도가 없거나(두 자리 연도) 맨 앞에 있으면 "연-월-일"
      // 순서로 본다 (2000-01-01, 96.02.09, 1996. 2. 9 등 한국식 표기).
      [year, month, day] = sepParts;
    } else {
      // 네 자리 연도가 뒤쪽에 있으면 "월-일-연도" 순서로 본다
      // (구글 시트가 날짜로 자동인식해서 2/9/1996처럼 표시하는 경우).
      [month, day, year] = sepParts;
    }
  } else {
    let digits = raw.replace(/[^0-9]/g, "");
    if (digits.length === 5) digits = `0${digits}`;
    if (digits.length === 6) {
      year = digits.slice(0, 2);
      month = digits.slice(2, 4);
      day = digits.slice(4, 6);
    } else if (digits.length === 8) {
      year = digits.slice(0, 4);
      month = digits.slice(4, 6);
      day = digits.slice(6, 8);
    } else {
      return null;
    }
  }

  let y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (String(year).length <= 2) {
    // 두 자리 연도가 50보다 크면 1900년대, 50 이하면 2000년대로 본다
    // (학습자 연령대를 고려한 값으로, 대부분의 실제 생년에 맞다).
    y = y <= 50 ? 2000 + y : 1900 + y;
  }
  return { year: y, month: m, day: d };
}

// 생년월일 비교 전용 정규화 함수. 표기가 서로 달라도 같은 날짜면
// 같은 "YYYYMMDD" 문자열이 되도록 통일한다. 알아볼 수 없는 값이면
// 빈 문자열을 돌려준다.
export function normalizeBirthDate(value) {
  const parts = parseBirthDateParts(value);
  if (!parts) return "";
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}${mm}${dd}`;
}

// 구성원 등록/수정 시 구글 시트에 실제로 저장할 값을 만든다.
// 맨 앞에 어퍼스트로피(')를 붙여서, 구글 시트가 이 값을 날짜나 숫자로
// 자동 변환하지 않고 항상 글자 그대로("1996-02-09")의 텍스트로
// 저장하도록 강제한다 (사람마다 표시 형식이 달라져서 로그인이 안 되는
// 문제의 근본 원인이었다). 어퍼스트로피 자체는 시트에 표시되지 않는다.
// 형식을 알아볼 수 없으면 null을 돌려준다(호출부에서 오류 처리).
export function formatBirthDateForStorage(value) {
  const parts = parseBirthDateParts(value);
  if (!parts) return null;
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `'${parts.year}-${mm}-${dd}`;
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
