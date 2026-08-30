// 도메인 로직 계층: 구성원 인증, 구성원 화면용 데이터 조합, 관리자 CRUD,
// 일괄 업로드 검증을 담당한다. 화면(페이지)이나 API 라우트는 이 파일의
// 함수만 호출하면 되고, Google Sheets API의 세부사항은 몰라도 된다.

import {
  readSheet,
  appendRow,
  appendRows,
  updateRowByNumber,
  deleteRowByNumber,
} from "./sheetsClient";
import {
  SHEET_NAMES,
  HEADERS,
  PROJECT_SCORE_FIELDS,
  PROJECT_MAX_PER_ITEM,
  PROJECT_SCORE_ALIASES,
} from "./schema";
import {
  normalizeDigits,
  isPublicValue,
  todayStr,
  toNumber,
  generateId,
} from "./format";
import {
  findValueByAliases,
  findQuestionColumns,
  resolveMemberId,
  findRawValue,
  normalizeHeaderKey,
} from "./uploadMatch";

// 시트를 읽어온 행(rawRow, 실제 헤더 글자가 키)을 정식 필드명 기준 객체로
// 바꾼다. 관리자가 시트 헤더를 보기 좋게 꾸미다가(예: "공개여부" ->
// "공개 여부", "테스트ID" -> "테스트 ID") 값을 아예 못 읽어서 화면에
// 빈 칸/틀린 상태로 보이거나, ID를 못 찾아 수정 대신 새로 생성되는 사고를
// 막기 위함. aliasMap을 넘기면 "완성도" 대신 "&안정성"처럼 아예 다른
// 표현까지도 인식한다.
function normalizeRow(sheetName, rawRow, aliasMap = {}) {
  if (!rawRow) return rawRow;
  const out = { __rowNumber: rawRow.__rowNumber };
  for (const field of HEADERS[sheetName]) {
    const aliases = aliasMap[field] || [];
    const value = findRawValue(rawRow, field, aliases);
    out[field] = value !== undefined ? value : "";
  }
  return out;
}

function normalizeProjectRow(rawRow) {
  return normalizeRow(SHEET_NAMES.PROJECTS, rawRow, PROJECT_SCORE_ALIASES);
}

function normalizeTestRow(rawRow) {
  return normalizeRow(SHEET_NAMES.TESTS, rawRow);
}

function normalizeTestResultRow(rawRow) {
  return normalizeRow(SHEET_NAMES.TEST_RESULTS, rawRow);
}

// ---------------------------------------------------------------------------
// 공통 헬퍼
// ---------------------------------------------------------------------------

async function findRowByField(sheetName, field, value) {
  const { rows } = await readSheet(sheetName);
  const target = String(value ?? "").trim();
  return (
    rows.find((r) => {
      if (r[field] !== undefined) return String(r[field]).trim() === target;
      // 실제 시트 헤더가 정식 이름과 완전히 같지 않은 경우(예: "평가ID" 대신
      // "평가 ID")를 위한 안전장치. 관리자가 헤더 글자를 보기 좋게 꾸미다가
      // ID로 조회/수정/삭제가 안 되는 사고를 막는다.
      const normalizedField = normalizeHeaderKey(field);
      const matchedKey = Object.keys(r).find((k) => normalizeHeaderKey(k).startsWith(normalizedField));
      return matchedKey !== undefined && String(r[matchedKey]).trim() === target;
    }) || null
  );
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
  }
}

class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    this.details = details;
  }
}

export { NotFoundError, ValidationError };

// ---------------------------------------------------------------------------
// 구성원 인증 / 구성원 화면
// ---------------------------------------------------------------------------

export async function findMemberByNameAndBirth(name, birth) {
  const { rows } = await readSheet(SHEET_NAMES.MEMBERS);
  const targetName = String(name ?? "").trim();
  const targetBirth = normalizeDigits(birth);
  if (!targetName || !targetBirth) return null;
  return (
    rows.find(
      (r) =>
        String(r["이름"]).trim() === targetName &&
        normalizeDigits(r["생년월일"]) === targetBirth
    ) || null
  );
}

export async function getMemberById(memberId) {
  return findRowByField(SHEET_NAMES.MEMBERS, "구성원ID", memberId);
}

export async function getMemberSummary(memberId) {
  const member = await getMemberById(memberId);
  if (!member) throw new NotFoundError("구성원 정보를 찾을 수 없습니다.");

  const [{ rows: rawTests }, { rows: testResults }, { rows: rawProjects }] = await Promise.all([
    readSheet(SHEET_NAMES.TESTS),
    readSheet(SHEET_NAMES.TEST_RESULTS),
    readSheet(SHEET_NAMES.PROJECTS),
  ]);
  const tests = rawTests.map(normalizeTestRow);
  const projects = rawProjects.map(normalizeProjectRow);

  const testMap = new Map(tests.map((t) => [String(t["테스트ID"]).trim(), t]));

  const testList = testResults
    .filter((r) => String(r["구성원ID"]).trim() === String(memberId).trim())
    .map((r) => {
      const test = testMap.get(String(r["테스트ID"]).trim());
      if (!test) return null;
      if (!isPublicValue(test["공개여부"])) return null;
      return {
        resultId: r["결과ID"],
        testName: test["테스트명"],
        testDate: test["응시일"],
        score: toNumber(r["총점"]),
        maxScore: toNumber(test["만점"]),
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.testDate).localeCompare(String(b.testDate)));

  const projectList = projects
    .filter(
      (p) =>
        String(p["구성원ID"]).trim() === String(memberId).trim() && isPublicValue(p["공개여부"])
    )
    .map((p) => ({
      evalId: p["평가ID"],
      projectName: p["프로젝트명"],
      presentDate: p["발표일"],
      score: computeProjectTotal(p),
      maxScore: PROJECT_SCORE_FIELDS.length * PROJECT_MAX_PER_ITEM,
    }))
    .sort((a, b) => String(a.presentDate).localeCompare(String(b.presentDate)));

  return {
    member: {
      memberId: member["구성원ID"],
      name: member["이름"],
      courseName: member["과정명"],
      cohort: member["기수"],
    },
    tests: testList,
    projects: projectList,
  };
}

export async function getTestDetailForMember(memberId, resultId) {
  const { rows: rawResults } = await readSheet(SHEET_NAMES.TEST_RESULTS);
  const result = rawResults.map(normalizeTestResultRow).find(
    (r) =>
      String(r["결과ID"]).trim() === String(resultId).trim() &&
      String(r["구성원ID"]).trim() === String(memberId).trim()
  );
  if (!result) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");

  const test = normalizeTestRow(await findRowByField(SHEET_NAMES.TESTS, "테스트ID", result["테스트ID"]));
  if (!test || !isPublicValue(test["공개여부"])) {
    throw new NotFoundError("공개되지 않은 테스트 결과입니다.");
  }

  const questions = buildQuestionsFromResult(test, result).map((q) => ({
    questionNumber: q["문항번호"],
    earned: q["획득점수"],
    max: q["배점"],
    deducted: q["감점여부"] === "Y",
    feedback: "",
  }));

  return {
    testName: test["테스트명"],
    testDate: test["응시일"],
    maxScore: toNumber(test["만점"]),
    score: toNumber(result["총점"]),
    summary: result["총평"] || "",
    combinedFeedback: result["문항별피드백"] || "",
    questions,
    deductedQuestions: questions.filter((q) => q.deducted).map((q) => q.questionNumber),
  };
}

export async function getProjectDetailForMember(memberId, evalId) {
  const project = normalizeProjectRow(await findRowByField(SHEET_NAMES.PROJECTS, "평가ID", evalId));
  if (
    !project ||
    String(project["구성원ID"]).trim() !== String(memberId).trim() ||
    !isPublicValue(project["공개여부"])
  ) {
    throw new NotFoundError("프로젝트 평가 결과를 찾을 수 없습니다.");
  }
  return {
    projectName: project["프로젝트명"],
    presentDate: project["발표일"],
    instructor: project["강사명"],
    items: PROJECT_SCORE_FIELDS.map((field) => ({
      field,
      score: toNumber(project[field]),
      max: PROJECT_MAX_PER_ITEM,
    })),
    total: computeProjectTotal(project),
    maxTotal: PROJECT_SCORE_FIELDS.length * PROJECT_MAX_PER_ITEM,
    comment: project["평가코멘트"] || "",
  };
}

function computeProjectTotal(project) {
  return PROJECT_SCORE_FIELDS.reduce((sum, f) => sum + toNumber(project[f]), 0);
}

// ---------------------------------------------------------------------------
// 관리자: 구성원 관리
// ---------------------------------------------------------------------------

export async function listMembers({ courseName, cohort, keyword } = {}) {
  const { rows } = await readSheet(SHEET_NAMES.MEMBERS);
  return rows.filter((m) => {
    if (courseName && String(m["과정명"]).trim() !== courseName.trim()) return false;
    if (cohort && String(m["기수"]).trim() !== cohort.trim()) return false;
    if (keyword) {
      const k = keyword.trim();
      if (!String(m["이름"]).includes(k) && !String(m["구성원ID"]).includes(k)) return false;
    }
    return true;
  });
}

// 새 구성원ID를 "기수-순번" 형식(예: 4-24)으로 짧게 만들어준다. 같은 기수
// 안에서 이미 쓰인 순번 중 가장 큰 값 다음 번호를 붙인다. 기수를 입력하지
// 않은 경우에는 전체 구성원 중 가장 큰 순번 다음 번호를 그냥 숫자로 쓴다.
async function nextMemberSequenceId(cohort) {
  const cohortKey = String(cohort ?? "").trim();
  const { rows: existing } = await readSheet(SHEET_NAMES.MEMBERS);
  const prefix = cohortKey ? `${cohortKey}-` : "";
  const usedNumbers = existing
    .map((m) => String(m["구성원ID"] ?? "").trim())
    .filter((id) => (cohortKey ? id.startsWith(prefix) : /^\d+$/.test(id)))
    .map((id) => Number(cohortKey ? id.slice(prefix.length) : id))
    .filter((n) => Number.isFinite(n));
  const next = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
  return cohortKey ? `${cohortKey}-${next}` : String(next);
}

export async function createMember(data) {
  if (!data["이름"] || !data["생년월일"]) {
    throw new ValidationError("이름과 생년월일은 필수입니다.");
  }
  const row = {
    구성원ID: data["구성원ID"] || (await nextMemberSequenceId(data["기수"])),
    이름: data["이름"],
    생년월일: data["생년월일"],
    과정명: data["과정명"] || "",
    기수: data["기수"] || "",
    상태: data["상태"] || "재학",
  };
  await appendRow(SHEET_NAMES.MEMBERS, row);
  return row;
}

export async function updateMember(memberId, updates) {
  const { rows } = await readSheet(SHEET_NAMES.MEMBERS);
  const target = rows.find((r) => String(r["구성원ID"]).trim() === String(memberId).trim());
  if (!target) throw new NotFoundError("구성원을 찾을 수 없습니다.");
  const merged = { ...target, ...updates, 구성원ID: target["구성원ID"] };
  await updateRowByNumber(SHEET_NAMES.MEMBERS, target.__rowNumber, merged);
  return merged;
}

export async function deleteMember(memberId) {
  const { rows } = await readSheet(SHEET_NAMES.MEMBERS);
  const target = rows.find((r) => String(r["구성원ID"]).trim() === String(memberId).trim());
  if (!target) throw new NotFoundError("구성원을 찾을 수 없습니다.");
  await deleteRowByNumber(SHEET_NAMES.MEMBERS, target.__rowNumber);
}

// ---------------------------------------------------------------------------
// 관리자: 테스트 관리
// ---------------------------------------------------------------------------

export async function getTest(testId) {
  const test = normalizeTestRow(await findRowByField(SHEET_NAMES.TESTS, "테스트ID", testId));
  if (!test) throw new NotFoundError("테스트를 찾을 수 없습니다.");
  return test;
}

export async function listTests({ courseName, cohort } = {}) {
  const { rows: rawRows } = await readSheet(SHEET_NAMES.TESTS);
  const rows = rawRows.map(normalizeTestRow);
  return rows.filter((t) => {
    if (courseName && String(t["과정명"]).trim() !== courseName.trim()) return false;
    if (cohort && String(t["기수"]).trim() !== cohort.trim()) return false;
    return true;
  });
}

// "8,8,8,5,8,12,8,12,8,5,8,10" 같은 문자열을 [8,8,8,5,8,12,8,12,8,5,8,10]
// 로 바꾼다. 형식이 이상하면 에러를 던진다 (관리자 화면에서 저장 시점에
// 바로 알려주기 위함).
export function parseQuestionScores(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];
  const parts = trimmed.split(",").map((s) => s.trim());
  const nums = parts.map((p) => toNumber(p, null));
  if (nums.some((n) => n === null || n < 0)) {
    throw new ValidationError(
      "문항배점은 쉼표(,)로 구분된 0 이상의 숫자여야 합니다. 예: 8,8,8,5,8,12,8,12,8,5,8,10"
    );
  }
  return nums;
}

export async function createTest(data) {
  if (!data["테스트명"] || !data["만점"]) {
    throw new ValidationError("테스트명과 만점은 필수입니다.");
  }
  if (data["문항배점"]) parseQuestionScores(data["문항배점"]); // 형식만 검증
  const row = {
    테스트ID: data["테스트ID"] || generateId("T"),
    테스트명: data["테스트명"],
    과정명: data["과정명"] || "",
    기수: data["기수"] || "",
    응시일: data["응시일"] || "",
    만점: data["만점"],
    공개여부: data["공개여부"] || "비공개",
    문항배점: data["문항배점"] || "",
    채점기준: data["채점기준"] || "",
  };
  await appendRow(SHEET_NAMES.TESTS, row);
  return row;
}

export async function updateTest(testId, updates) {
  if (updates["문항배점"]) parseQuestionScores(updates["문항배점"]); // 형식만 검증
  const rawTarget = await findRowByField(SHEET_NAMES.TESTS, "테스트ID", testId);
  if (!rawTarget) throw new NotFoundError("테스트를 찾을 수 없습니다.");
  const target = normalizeTestRow(rawTarget);
  const merged = { ...target, ...updates, 테스트ID: target["테스트ID"] };
  await updateRowByNumber(SHEET_NAMES.TESTS, rawTarget.__rowNumber, merged);
  return merged;
}

export async function deleteTest(testId) {
  const target = await findRowByField(SHEET_NAMES.TESTS, "테스트ID", testId);
  if (!target) throw new NotFoundError("테스트를 찾을 수 없습니다.");
  await deleteRowByNumber(SHEET_NAMES.TESTS, target.__rowNumber);
}

// ---------------------------------------------------------------------------
// 관리자: 테스트 결과 (문항별 결과 포함)
// ---------------------------------------------------------------------------

export async function listTestResults({ testId, memberId } = {}) {
  const [{ rows: rawResults }, { rows: rawTests }, { rows: members }] = await Promise.all([
    readSheet(SHEET_NAMES.TEST_RESULTS),
    readSheet(SHEET_NAMES.TESTS),
    readSheet(SHEET_NAMES.MEMBERS),
  ]);
  const results = rawResults.map(normalizeTestResultRow);
  const tests = rawTests.map(normalizeTestRow);
  const testMap = new Map(tests.map((t) => [String(t["테스트ID"]).trim(), t]));
  const memberMap = new Map(members.map((m) => [String(m["구성원ID"]).trim(), m]));

  return results
    .filter((r) => {
      if (testId && String(r["테스트ID"]).trim() !== String(testId).trim()) return false;
      if (memberId && String(r["구성원ID"]).trim() !== String(memberId).trim()) return false;
      return true;
    })
    .map((r) => ({
      ...r,
      테스트명: testMap.get(String(r["테스트ID"]).trim())?.["테스트명"] || "",
      구성원이름: memberMap.get(String(r["구성원ID"]).trim())?.["이름"] || "",
    }));
}

// 문항별 결과를 "테스트문항결과"라는 별도 탭 대신, "테스트결과" 한 줄
// 안에 "문항점수"(획득점수를 Q1,Q2... 순서로 콤마 나열) 컬럼으로 압축해서
// 저장한다. 배점은 테스트의 "문항배점" 설정을 그대로 따르므로 중복 저장하지
// 않는다. 이 함수는 그 압축된 값을 다시 문항별 배열로 풀어준다.
function buildQuestionsFromResult(test, result) {
  const maxScores = test ? parseQuestionScores(test["문항배점"]) : [];
  const earnedScores = String(result["문항점수"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map((s) => toNumber(s, 0));
  return maxScores.map((max, i) => {
    const earned = earnedScores[i] ?? 0;
    return {
      문항번호: `Q${i + 1}`,
      배점: max,
      획득점수: earned,
      감점여부: earned < max ? "Y" : "N",
      피드백: "",
    };
  });
}

export async function getTestResultWithQuestions(resultId) {
  const result = normalizeTestResultRow(
    await findRowByField(SHEET_NAMES.TEST_RESULTS, "결과ID", resultId)
  );
  if (!result) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");
  const test = normalizeTestRow(await findRowByField(SHEET_NAMES.TESTS, "테스트ID", result["테스트ID"]));
  const questions = buildQuestionsFromResult(test, result);
  return { result, questions };
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new ValidationError("문항별 결과를 1개 이상 입력해주세요.");
  }
  for (const q of questions) {
    if (!q["문항번호"]) throw new ValidationError("문항번호가 비어있는 항목이 있습니다.");
    const max = toNumber(q["배점"], null);
    const earned = toNumber(q["획득점수"], null);
    if (max === null || max < 0) throw new ValidationError(`${q["문항번호"]}의 배점이 올바르지 않습니다.`);
    if (earned === null || earned < 0 || earned > max) {
      throw new ValidationError(`${q["문항번호"]}의 획득점수(${q["획득점수"]})가 배점(${q["배점"]}) 범위를 벗어났습니다.`);
    }
  }
}

export async function createTestResult(data) {
  const { 테스트ID, 구성원ID, 총평, 문항별피드백, questions } = data;
  if (!테스트ID || !구성원ID) throw new ValidationError("테스트ID와 구성원ID는 필수입니다.");
  validateQuestions(questions);

  const test = await findRowByField(SHEET_NAMES.TESTS, "테스트ID", 테스트ID);
  if (!test) throw new ValidationError(`존재하지 않는 테스트ID입니다: ${테스트ID}`);
  const member = await findRowByField(SHEET_NAMES.MEMBERS, "구성원ID", 구성원ID);
  if (!member) throw new ValidationError(`존재하지 않는 구성원ID입니다: ${구성원ID}`);

  const { rows: rawExisting } = await readSheet(SHEET_NAMES.TEST_RESULTS);
  const existing = rawExisting.map(normalizeTestResultRow);
  const dup = existing.find(
    (r) =>
      String(r["테스트ID"]).trim() === String(테스트ID).trim() &&
      String(r["구성원ID"]).trim() === String(구성원ID).trim()
  );
  if (dup) {
    throw new ValidationError(
      `이미 등록된 결과입니다 (${member["이름"]} / ${test["테스트명"]}). 수정은 기존 결과를 편집해주세요.`
    );
  }

  const resultId = generateId("R");
  const total = questions.reduce((sum, q) => sum + toNumber(q["획득점수"]), 0);
  const 문항점수 = questions.map((q) => toNumber(q["획득점수"])).join(",");
  const 감점문항 = questions
    .filter((q) => toNumber(q["획득점수"]) < toNumber(q["배점"]))
    .map((q) => q["문항번호"])
    .join(",");
  const now = todayStr();

  await appendRow(SHEET_NAMES.TEST_RESULTS, {
    결과ID: resultId,
    테스트ID,
    구성원ID,
    // 시트에 "성명" 칸을 따로 추가해두신 경우를 위해 함께 적어준다 (그 칸이
    // 없는 시트라면 그냥 무시된다).
    성명: member["이름"] || "",
    총점: total,
    문항점수,
    감점문항,
    총평: 총평 || "",
    문항별피드백: 문항별피드백 || "",
    등록일: now,
    수정일: now,
  });

  return { 결과ID: resultId, 총점: total };
}

export async function updateTestResult(resultId, data) {
  const { 총평, 문항별피드백, questions } = data;
  validateQuestions(questions);

  const rawTarget = await findRowByField(SHEET_NAMES.TEST_RESULTS, "결과ID", resultId);
  if (!rawTarget) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");
  const target = normalizeTestResultRow(rawTarget);

  const total = questions.reduce((sum, q) => sum + toNumber(q["획득점수"]), 0);
  const 문항점수 = questions.map((q) => toNumber(q["획득점수"])).join(",");
  const 감점문항 = questions
    .filter((q) => toNumber(q["획득점수"]) < toNumber(q["배점"]))
    .map((q) => q["문항번호"])
    .join(",");
  const merged = {
    ...target,
    총점: total,
    문항점수,
    감점문항,
    총평: 총평 ?? target["총평"],
    문항별피드백: 문항별피드백 ?? target["문항별피드백"],
    수정일: todayStr(),
  };
  await updateRowByNumber(SHEET_NAMES.TEST_RESULTS, rawTarget.__rowNumber, merged);

  return { 결과ID: resultId, 총점: total };
}

export async function deleteTestResult(resultId) {
  const target = await findRowByField(SHEET_NAMES.TEST_RESULTS, "결과ID", resultId);
  if (!target) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");
  await deleteRowByNumber(SHEET_NAMES.TEST_RESULTS, target.__rowNumber);
}

// ---------------------------------------------------------------------------
// 관리자: 프로젝트 평가
// ---------------------------------------------------------------------------

export async function listProjects({ memberId } = {}) {
  const [{ rows: rawProjects }, { rows: members }] = await Promise.all([
    readSheet(SHEET_NAMES.PROJECTS),
    readSheet(SHEET_NAMES.MEMBERS),
  ]);
  const projects = rawProjects.map(normalizeProjectRow);
  const memberMap = new Map(members.map((m) => [String(m["구성원ID"]).trim(), m]));
  return projects
    .filter((p) => !memberId || String(p["구성원ID"]).trim() === String(memberId).trim())
    .map((p) => ({
      ...p,
      총점: computeProjectTotal(p),
      구성원이름: memberMap.get(String(p["구성원ID"]).trim())?.["이름"] || "",
    }));
}

function validateProjectScores(data) {
  for (const field of PROJECT_SCORE_FIELDS) {
    const v = toNumber(data[field], null);
    if (v === null || v < 0 || v > PROJECT_MAX_PER_ITEM) {
      throw new ValidationError(`${field} 점수는 0~${PROJECT_MAX_PER_ITEM} 사이여야 합니다.`);
    }
  }
}

export async function createProject(data) {
  if (!data["구성원ID"] || !data["프로젝트명"]) {
    throw new ValidationError("구성원ID와 프로젝트명은 필수입니다.");
  }
  validateProjectScores(data);
  const member = await findRowByField(SHEET_NAMES.MEMBERS, "구성원ID", data["구성원ID"]);
  if (!member) throw new ValidationError(`존재하지 않는 구성원ID입니다: ${data["구성원ID"]}`);

  const now = todayStr();
  const row = {
    평가ID: data["평가ID"] || generateId("P"),
    구성원ID: data["구성원ID"],
    // 시트에 "성명" 칸을 따로 추가해두신 경우를 위해, 구성원ID로 찾은
    // 구성원의 실제 이름을 함께 적어준다 (그 칸이 없는 시트라면 그냥
    // 무시된다).
    성명: member["이름"] || "",
    프로젝트명: data["프로젝트명"],
    발표일: data["발표일"] || "",
    강사명: data["강사명"] || "",
    기술활용도: toNumber(data["기술활용도"]),
    기능구현완성도: toNumber(data["기능구현완성도"]),
    문제해결: toNumber(data["문제해결"]),
    발표전달력: toNumber(data["발표전달력"]),
    총점: PROJECT_SCORE_FIELDS.reduce((s, f) => s + toNumber(data[f]), 0),
    평가코멘트: data["평가코멘트"] || "",
    공개여부: data["공개여부"] || "비공개",
    등록일: now,
    수정일: now,
  };
  await appendRow(SHEET_NAMES.PROJECTS, row);
  return row;
}

export async function updateProject(evalId, updates) {
  const rawTarget = await findRowByField(SHEET_NAMES.PROJECTS, "평가ID", evalId);
  if (!rawTarget) throw new NotFoundError("프로젝트 평가를 찾을 수 없습니다.");
  // rawTarget은 시트의 "실제 헤더 글자"를 키로 가지고 있어서, 헤더를 보기
  // 좋게 꾸며둔 경우(예: "공개여부" -> "공개 여부") updates의 정식 필드명과
  // 다른 키로 겹쳐 쓰이는 사고가 날 수 있다. 정식 필드명으로 먼저 정리한 뒤
  // updates를 덮어써야 "바꿨는데 그대로다" 같은 문제가 생기지 않는다.
  const target = normalizeProjectRow(rawTarget);
  const merged = { ...target, ...updates, 평가ID: target["평가ID"] };
  if (PROJECT_SCORE_FIELDS.some((f) => f in updates)) {
    validateProjectScores(merged);
    merged["총점"] = PROJECT_SCORE_FIELDS.reduce((s, f) => s + toNumber(merged[f]), 0);
  }
  merged["수정일"] = todayStr();
  await updateRowByNumber(SHEET_NAMES.PROJECTS, rawTarget.__rowNumber, merged);
  return merged;
}

export async function deleteProject(evalId) {
  const target = await findRowByField(SHEET_NAMES.PROJECTS, "평가ID", evalId);
  if (!target) throw new NotFoundError("프로젝트 평가를 찾을 수 없습니다.");
  await deleteRowByNumber(SHEET_NAMES.PROJECTS, target.__rowNumber);
}

// ---------------------------------------------------------------------------
// 일괄 업로드 검증 + 등록
// 업로드 파일 형식은 app/api/admin/upload/*/route.js 와 README 를 참고.
// ---------------------------------------------------------------------------

// 구성원 명단을 한 번에 등록한다. 이름+생년월일이 같은 사람이 이미
// 등록되어 있으면 건너뛰지 않고 오류로 알려준다(중복 등록 방지).
export async function bulkCreateMembers(records) {
  const errors = [];
  const skipped = [];
  const { rows: existingMembers } = await readSheet(SHEET_NAMES.MEMBERS);
  const existingKeys = new Set(
    existingMembers.map(
      (m) => `${String(m["이름"]).trim()}::${normalizeDigits(m["생년월일"])}`
    )
  );

  const parsedRows = [];
  records.forEach((rec, idx) => {
    const line = idx + 2; // 1행은 헤더
    const name = String(findValueByAliases(rec, ["이름", "성명"]) ?? "").trim();
    const birth = String(findValueByAliases(rec, ["생년월일", "생일"]) ?? "").trim();
    if (!name || !birth) {
      errors.push(`${line}행: 이름과 생년월일은 필수입니다.`);
      return;
    }
    const key = `${name}::${normalizeDigits(birth)}`;
    if (existingKeys.has(key)) {
      skipped.push(`${line}행: 이미 등록된 구성원이라서 건너뛰었습니다 (${name}). 이름이 같은 다른 사람이라면 헷갈리지 않도록 생년월일을 다시 확인해주세요.`);
      return;
    }

    parsedRows.push({
      key,
      이름: name,
      생년월일: birth,
      과정명: findValueByAliases(rec, ["과정명"]) || "",
      기수: findValueByAliases(rec, ["기수"]) || "",
      상태: findValueByAliases(rec, ["상태"]) || "재학",
    });
  });

  // 파일 내 중복(같은 이름+생년월일이 파일 안에 여러 번) 체크
  const seen = new Set();
  parsedRows.forEach((r) => {
    if (seen.has(r.key)) {
      errors.push(`같은 이름·생년월일(${r["이름"]})의 행이 파일 안에 여러 번 있습니다.`);
    } else {
      seen.add(r.key);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors, skipped, savedCount: 0 };
  }

  // 한 명씩 createMember()를 호출하면(사람마다 구글시트 읽기가 여러 번씩
  // 일어나서) 인원이 많을 때 구글 API 사용량 제한(Quota exceeded)에 걸릴
  // 수 있다. 그래서 구성원ID를 미리 메모리에서 한 번에 계산한 뒤, 전체를
  // 한 번의 쓰기 요청으로 묶어서 저장한다.
  const cohortCounters = new Map();
  function nextIdFor(cohortKey) {
    if (!cohortCounters.has(cohortKey)) {
      const prefix = cohortKey ? `${cohortKey}-` : "";
      const usedNumbers = existingMembers
        .map((m) => String(m["구성원ID"] ?? "").trim())
        .filter((id) => (cohortKey ? id.startsWith(prefix) : /^\d+$/.test(id)))
        .map((id) => Number(cohortKey ? id.slice(prefix.length) : id))
        .filter((n) => Number.isFinite(n));
      cohortCounters.set(cohortKey, usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1);
    }
    const next = cohortCounters.get(cohortKey);
    cohortCounters.set(cohortKey, next + 1);
    return cohortKey ? `${cohortKey}-${next}` : String(next);
  }

  const rowObjects = parsedRows.map((row) => ({
    구성원ID: nextIdFor(String(row["기수"] ?? "").trim()),
    이름: row["이름"],
    생년월일: row["생년월일"],
    과정명: row["과정명"],
    기수: row["기수"],
    상태: row["상태"],
  }));
  await appendRows(SHEET_NAMES.MEMBERS, rowObjects);

  return { success: true, errors: [], skipped, savedCount: rowObjects.length };
}

// 강사님이 "예쁜 채점 시트"(순번,이름,총점,Q1..Qn,감점문항,문항별피드백,총평)
// 형식으로 채운 파일을 그대로 업로드할 때 사용한다. 문항 수와 배점은
// 해당 테스트ID의 "문항배점" 설정을 그대로 따른다 (파일에 적힌 값이
// 아니라 테스트 설정이 기준이라, 강사님이 배점을 잘못 옮겨 적어도
// 안전하다). 구성원은 구성원ID가 있으면 그것으로, 없으면 이름
// (+생년월일)으로 찾는다.
export async function bulkCreateTestResultsWide(testId, records) {
  const errors = [];
  const skipped = [];
  const test = normalizeTestRow(await findRowByField(SHEET_NAMES.TESTS, "테스트ID", testId));
  if (!test) throw new ValidationError(`존재하지 않는 테스트ID입니다: ${testId}`);
  const maxScores = parseQuestionScores(test["문항배점"]);
  if (maxScores.length === 0) {
    throw new ValidationError(
      "이 테스트에는 문항별 배점이 설정되어 있지 않습니다. 관리자 화면의 테스트 수정에서 문항배점을 먼저 입력해주세요."
    );
  }

  const [{ rows: members }, { rows: rawExistingResults }] = await Promise.all([
    readSheet(SHEET_NAMES.MEMBERS),
    readSheet(SHEET_NAMES.TEST_RESULTS),
  ]);
  const existingResults = rawExistingResults.map(normalizeTestResultRow);
  const existingMemberIds = new Set(
    existingResults
      .filter((r) => String(r["테스트ID"]).trim() === String(testId).trim())
      .map((r) => String(r["구성원ID"]).trim())
  );

  const parsedRows = [];
  records.forEach((rec, idx) => {
    const line = idx + 2; // 1행은 헤더
    const { memberId, error } = resolveMemberId(rec, members);
    if (error) {
      errors.push(`${line}행: ${error}`);
      return;
    }
    const qCols = findQuestionColumns(rec);
    if (qCols.length === 0) {
      errors.push(`${line}행: Q1, Q2 처럼 문항 점수 칸을 찾을 수 없습니다.`);
      return;
    }
    if (qCols.length !== maxScores.length) {
      errors.push(
        `${line}행: 이 테스트는 문항이 ${maxScores.length}개인데, 파일에는 ${qCols.length}개의 문항 칸이 있습니다.`
      );
      return;
    }
    const questions = [];
    let rowHasError = false;
    qCols.forEach((col, i) => {
      const max = maxScores[i];
      const earned = toNumber(col.value, null);
      if (earned === null || earned < 0 || earned > max) {
        errors.push(`${line}행: Q${col.index} 점수(${col.value})가 배점(${max}) 범위를 벗어났습니다.`);
        rowHasError = true;
        return;
      }
      questions.push({ 문항번호: `Q${col.index}`, 배점: max, 획득점수: earned, 피드백: "" });
    });
    if (rowHasError) return;

    // 이미 등록된 결과는 전체 업로드를 막는 "오류"가 아니라, 이 행만 건너뛰는
    // 것으로 처리한다. 강사님/관리자가 학생을 조금씩 나눠서 여러 번
    // 업로드하는 경우가 많은데, 먼저 저장된 학생이 하나 있다고 나머지
    // 전체가 저장 안 되면 매번 파일에서 그 줄을 지우고 다시 올려야 해서
    // 불편하다.
    if (existingMemberIds.has(memberId)) {
      skipped.push(`${line}행: 이미 등록된 결과라서 건너뛰었습니다 (구성원ID ${memberId}). 수정은 관리자 화면에서 해주세요.`);
      return;
    }

    parsedRows.push({
      memberId,
      questions,
      총평: findValueByAliases(rec, ["총평"]) || "",
      문항별피드백: findValueByAliases(rec, ["문항별피드백", "문항별 피드백"]) || "",
    });
  });

  // 파일 내 중복(같은 구성원이 여러 행) 체크 — 이건 파일 자체가 잘못된
  // 것이라 진짜 오류로 처리한다.
  const seen = new Set();
  parsedRows.forEach((r) => {
    if (seen.has(r.memberId)) {
      errors.push(`같은 구성원(${r.memberId})의 결과가 파일 안에 여러 번 있습니다.`);
    } else {
      seen.add(r.memberId);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors, skipped, savedCount: 0 };
  }

  // 한 명씩 createTestResult()를 호출하면 사람마다 구글시트 읽기가 여러 번씩
  // 일어나서, 인원이 많은 반(20~30명)을 한 번에 올릴 때 구글 API 사용량
  // 제한(Quota exceeded)에 걸릴 수 있다. 그래서 이미 읽어둔 members 목록을
  // 그대로 활용해서 한 번의 쓰기 요청으로 전체를 저장한다.
  const memberMap = new Map(members.map((m) => [String(m["구성원ID"]).trim(), m]));
  const now = todayStr();
  const rowObjects = parsedRows.map((row) => {
    const total = row.questions.reduce((sum, q) => sum + toNumber(q["획득점수"]), 0);
    const 문항점수 = row.questions.map((q) => toNumber(q["획득점수"])).join(",");
    const 감점문항 = row.questions
      .filter((q) => toNumber(q["획득점수"]) < toNumber(q["배점"]))
      .map((q) => q["문항번호"])
      .join(",");
    return {
      결과ID: generateId("R"),
      테스트ID: testId,
      구성원ID: row.memberId,
      성명: memberMap.get(row.memberId)?.["이름"] || "",
      총점: total,
      문항점수,
      감점문항,
      총평: row.총평,
      문항별피드백: row.문항별피드백,
      등록일: now,
      수정일: now,
    };
  });
  await appendRows(SHEET_NAMES.TEST_RESULTS, rowObjects);

  return { success: true, errors: [], skipped, savedCount: rowObjects.length };
}

export async function bulkCreateProjects(records) {
  const errors = [];
  const skipped = [];
  const { rows: members } = await readSheet(SHEET_NAMES.MEMBERS);
  const { rows: rawExistingProjects } = await readSheet(SHEET_NAMES.PROJECTS);
  const existingProjects = rawExistingProjects.map(normalizeProjectRow);
  const existingKeys = new Set(
    existingProjects.map(
      (p) => `${String(p["구성원ID"]).trim()}::${String(p["프로젝트명"]).trim()}`
    )
  );

  const parsedRows = [];
  records.forEach((rec, idx) => {
    const line = idx + 2;
    const { memberId, error } = resolveMemberId(rec, members);
    if (error) {
      errors.push(`${line}행: ${error}`);
      return;
    }
    // 프로젝트명이 없는 강사님용 시트도 있을 수 있어, 비어있으면 기본값을 넣는다.
    const projectName =
      String(findValueByAliases(rec, ["프로젝트명", "프로젝트"]) ?? "").trim() || "프로젝트 평가";

    const scores = {};
    let rowHasError = false;
    for (const field of PROJECT_SCORE_FIELDS) {
      const aliases = [field, ...(PROJECT_SCORE_ALIASES[field] || [])];
      const raw = findValueByAliases(rec, aliases);
      const v = toNumber(raw, null);
      if (raw === undefined || v === null || v < 0 || v > PROJECT_MAX_PER_ITEM) {
        errors.push(`${line}행: ${field} 점수는 0~${PROJECT_MAX_PER_ITEM} 사이의 값이어야 합니다.`);
        rowHasError = true;
        continue;
      }
      scores[field] = v;
    }
    if (rowHasError) return;

    if (existingKeys.has(`${memberId}::${projectName}`)) {
      skipped.push(`${line}행: 이미 등록된 평가라서 건너뛰었습니다 (${projectName}).`);
      return;
    }

    parsedRows.push({
      구성원ID: memberId,
      프로젝트명: projectName,
      발표일: findValueByAliases(rec, ["발표일"]) || "",
      강사명: findValueByAliases(rec, ["강사명"]) || "",
      ...scores,
      평가코멘트: findValueByAliases(rec, ["평가코멘트", "평가 코멘트"]) || "",
      공개여부: findValueByAliases(rec, ["공개여부"]) || "비공개",
    });
  });

  const seen = new Map();
  parsedRows.forEach((r) => {
    const key = `${r["구성원ID"]}::${r["프로젝트명"]}`;
    if (seen.has(key)) {
      errors.push(`같은 구성원(${r["구성원ID"]})의 "${r["프로젝트명"]}" 평가가 파일 안에 여러 번 있습니다.`);
    } else {
      seen.set(key, true);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors, skipped, savedCount: 0 };
  }

  // 한 명씩 createProject()를 호출하면 사람마다 구글시트 읽기가 여러 번씩
  // 일어나서, 인원이 많을 때 구글 API 사용량 제한(Quota exceeded)에 걸릴
  // 수 있다. 그래서 이미 읽어둔 members 목록을 그대로 활용해서 한 번의
  // 쓰기 요청으로 전체를 저장한다.
  const memberMap = new Map(members.map((m) => [String(m["구성원ID"]).trim(), m]));
  const now = todayStr();
  const rowObjects = parsedRows.map((row) => ({
    평가ID: generateId("P"),
    구성원ID: row["구성원ID"],
    성명: memberMap.get(String(row["구성원ID"]).trim())?.["이름"] || "",
    프로젝트명: row["프로젝트명"],
    발표일: row["발표일"],
    강사명: row["강사명"],
    기술활용도: row["기술활용도"],
    기능구현완성도: row["기능구현완성도"],
    문제해결: row["문제해결"],
    발표전달력: row["발표전달력"],
    총점: PROJECT_SCORE_FIELDS.reduce((s, f) => s + toNumber(row[f]), 0),
    평가코멘트: row["평가코멘트"],
    공개여부: row["공개여부"],
    등록일: now,
    수정일: now,
  }));
  await appendRows(SHEET_NAMES.PROJECTS, rowObjects);

  return { success: true, errors: [], skipped, savedCount: rowObjects.length };
}
