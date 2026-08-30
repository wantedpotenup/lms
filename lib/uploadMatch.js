// 업로드 파일(엑셀/CSV)의 헤더나 값이 시스템이 기대하는 것과 글자가
// 살짝 달라도(띄어쓰기, & 기호 등) 알아서 인식하도록 돕는 유틸리티.
// 강사님이 만든 "예쁜" 채점 시트를 그대로 다운로드해서 쓰는 것이
// 기본 흐름이지만, 혹시 직접 수정해서 올리더라도 최대한 관대하게
// 인식하기 위함이다.

import { normalizeDigits } from "./format";
import { MEMBER_NAME_ALIASES, MEMBER_BIRTH_ALIASES } from "./schema";

// 비교용으로 공백과 특수문자를 제거한 "느슨한" 문자열을 만든다.
// 예: "기능 구현 & 안정성(5점)" -> "기능구현안정성5점"
export function normalizeHeaderKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s()&./_-]/g, "");
}

// rec(업로드 파일의 한 행 객체)에서 alias 목록 중 하나로 "시작하는" 헤더의
// 값을 찾아 반환한다. 못 찾으면 undefined.
//
// 완전히 똑같은 글자가 아니라 "~로 시작하는지"로 비교하는 이유: 우리가
// 만들어주는 다운로드 양식은 "생년월일(필수, 예: 1998-05-06)"처럼 헤더에
// 안내 문구를 덧붙여두는데, 이걸 정확히 "생년월일"과 완전히 똑같은
// 글자로 비교하면 절대 못 찾는다. 안내 문구는 항상 핵심 이름 뒤에
// 붙으므로, 앞부분만 맞으면 같은 컬럼으로 인정한다.
export function findValueByAliases(rec, aliases) {
  const keys = Object.keys(rec);
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias);
    const matchedKey = keys.find((k) => normalizeHeaderKey(k).startsWith(normalizedAlias));
    if (matchedKey !== undefined && String(rec[matchedKey] ?? "").trim() !== "") {
      return rec[matchedKey];
    }
  }
  return undefined;
}

// rec 안에서 "Q1", "Q2(8점)", "문항1" 처럼 문항 번호를 나타내는 컬럼들을
// 찾아 [{ index, key, value }, ...] 형태로 번호순 정렬해 반환한다.
export function findQuestionColumns(rec) {
  const found = [];
  for (const key of Object.keys(rec)) {
    const m = String(key).trim().match(/^(?:Q|문항)\s*0*([0-9]+)/i);
    if (m) {
      found.push({ index: Number(m[1]), key, value: rec[key] });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return found;
}

// "구성원ID"가 직접 있으면 그걸 쓰고, 없으면 이름(+생년월일)으로
// 구성원을 찾는다. 이름이 여러 명 겹치면 생년월일이 필요하다는
// 에러를 던진다 (호출부에서 errors 배열에 담아 사용).
export function resolveMemberId(rec, members) {
  const directId = String(rec["구성원ID"] ?? "").trim();
  if (directId) return { memberId: directId, error: null };

  const name = String(findValueByAliases(rec, MEMBER_NAME_ALIASES) ?? "").trim();
  if (!name) {
    return { memberId: null, error: "구성원ID 또는 이름 중 하나는 반드시 있어야 합니다." };
  }
  const birthRaw = findValueByAliases(rec, MEMBER_BIRTH_ALIASES);
  const birth = birthRaw ? normalizeDigits(birthRaw) : null;

  const candidates = members.filter((m) => String(m["이름"]).trim() === name);
  if (candidates.length === 0) {
    return { memberId: null, error: `존재하지 않는 이름입니다 (${name}).` };
  }
  if (candidates.length === 1) {
    return { memberId: String(candidates[0]["구성원ID"]).trim(), error: null };
  }
  // 이름이 겹치는 경우 생년월일로 구분한다.
  if (!birth) {
    return {
      memberId: null,
      error: `이름이 같은 구성원이 여러 명입니다 (${name}). 생년월일 컬럼을 추가해서 구분해주세요.`,
    };
  }
  const exact = candidates.find((m) => normalizeDigits(m["생년월일"]) === birth);
  if (!exact) {
    return { memberId: null, error: `이름과 생년월일이 일치하는 구성원을 찾을 수 없습니다 (${name}).` };
  }
  return { memberId: String(exact["구성원ID"]).trim(), error: null };
}
