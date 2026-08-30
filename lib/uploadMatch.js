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

// rawRow(구글 시트에서 읽어온, "실제 헤더 글자"를 키로 가진 행 객체)에서
// canonicalField(시스템이 원래 기대하는 정식 필드명, 예: "공개여부")와
// 정확히 같은 키가 없어도, 관리자가 시트 헤더를 보기 좋게 살짝 바꿔뒀다면
// (공백 추가, "(5점)" 같은 안내 문구 등) 느슨하게 비교해서 값을 찾아준다.
// aliases를 넘기면 "완성도" 대신 "&안정성"처럼 아예 다른 표현까지도 인식한다.
// 못 찾으면 undefined를 반환한다.
export function findRawValue(rawRow, canonicalField, aliases = []) {
  if (rawRow[canonicalField] !== undefined) return rawRow[canonicalField];
  const keys = Object.keys(rawRow);
  const normalizedField = normalizeHeaderKey(canonicalField);
  if (normalizedField) {
    for (const key of keys) {
      if (normalizeHeaderKey(key).startsWith(normalizedField)) return rawRow[key];
    }
  }
  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias);
    if (!normalizedAlias) continue;
    for (const key of keys) {
      if (normalizeHeaderKey(key).startsWith(normalizedAlias)) return rawRow[key];
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
    return toResolvedMemberId(candidates[0], name);
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
  return toResolvedMemberId(exact, name);
}

// members 배열에서 찾은 한 명의 구성원 객체에서 실제 구성원ID 값을 꺼낸다.
// 구글 시트의 "구성원" 탭 헤더 행에 정확히 "구성원ID"라는 이름의 칸이 없으면
// 이 값이 비어있게 되는데, 이걸 그냥 String(undefined) 해버리면 "undefined"
// 라는 글자 그대로가 마치 정상적인 ID인 것처럼 반환되어 버린다. 그래서 값이
// 비어있는 경우는 반드시 에러로 처리한다.
function toResolvedMemberId(member, name) {
  const id = String(member["구성원ID"] ?? "").trim();
  if (!id) {
    return {
      memberId: null,
      error: `구성원(${name}) 데이터에 구성원ID가 비어있습니다. 구글 시트의 "구성원" 탭 헤더 행에 정확히 "구성원ID"라는 칸이 있는지 확인해주세요.`,
    };
  }
  return { memberId: id, error: null };
}
