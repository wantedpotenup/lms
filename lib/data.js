// 도메인 로직 계층: 구성원 인증, 구성원 화면용 데이터 조합, 관리자 CRUD,
// 일괄 업로드 검증을 담당한다. 화면(페이지)이나 API 라우트는 이 파일의
// 함수만 호출하면 되고, Google Sheets API의 세부사항은 몰라도 된다.

import {
  readSheet,
  appendRow,
  appendRows,
  updateRowByNumber,
  deleteRowByNumber,
  deleteRowsByNumbers,
} from "./sheetsClient";
import { SHEET_NAMES, PROJECT_SCORE_FIELDS, PROJECT_MAX_PER_ITEM, PROJECT_SCORE_ALIASES } from "./schema";
import {
  normalizeDigits,
  isPublicValue,
  todayStr,
  toNumber,
  isDeducted,
  sortByQuestionNumber,
  generateId,
} from "./format";
import { findValueByAliases, findQuestionColumns, resolveMemberId } from "./uploadMatch";

// ---------------------------------------------------------------------------
// 공통 헬퍼
// ---------------------------------------------------------------------------

async function findRowByField(sheetName, field, value) {
  const { rows } = await readSheet(sheetName);
  return rows.find((r) => String(r[field]).trim() === String(value).trim()) || null;
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

  const [{ rows: tests }, { rows: testResults }, { rows: projects }] = await Promise.all([
    readSheet(SHEET_NAMES.TESTS),
    readSheet(SHEET_NAMES.TEST_RESULTS),
    readSheet(SHEET_NAMES.PROJECTS),
  ]);

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
  const { rows: results } = await readSheet(SHEET_NAMES.TEST_RESULTS);
  const result = results.find(
    (r) =>
      String(r["결과ID"]).trim() === String(resultId).trim() &&
      String(r["구성원ID"]).trim() === String(memberId).trim()
  );
  if (!result) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");

  const test = await findRowByField(SHEET_NAMES.TESTS, "테스트ID", result["테스트ID"]);
  if (!test || !isPublicValue(test["공개여부"])) {
    throw new NotFoundError("공개되지 않은 테스트 결과입니다.");
  }

  const { rows: allQuestions } = await readSheet(SHEET_NAMES.TEST_QUESTIONS);
  const questions = sortByQuestionNumber(
    allQuestions.filter((q) => String(q["결과ID"]).trim() === String(resultId).trim())
  ).map((q) => ({
    questionNumber: q["문항번호"],
    earned: toNumber(q["획득점수"]),
    max: toNumber(q["배점"]),
    deducted: isDeducted(q),
    feedback: q["피드백"] || "",
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
  const project = await findRowByField(SHEET_NAMES.PROJECTS, "평가ID", evalId);
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

export async function createMember(data) {
  if (!data["이름"] || !data["생년월일"]) {
    throw new ValidationError("이름과 생년월일은 필수입니다.");
  }
  const row = {
    구성원ID: data["구성원ID"] || generateId("M"),
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
  const test = await findRowByField(SHEET_NAMES.TESTS, "테스트ID", testId);
  if (!test) throw new NotFoundError("테스트를 찾을 수 없습니다.");
  return test;
}

export async function listTests({ courseName, cohort } = {}) {
  const { rows } = await readSheet(SHEET_NAMES.TESTS);
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
  const { rows } = await readSheet(SHEET_NAMES.TESTS);
  const target = rows.find((r) => String(r["테스트ID"]).trim() === String(testId).trim());
  if (!target) throw new NotFoundError("테스트를 찾을 수 없습니다.");
  const merged = { ...target, ...updates, 테스트ID: target["테스트ID"] };
  await updateRowByNumber(SHEET_NAMES.TESTS, target.__rowNumber, merged);
  return merged;
}

export async function deleteTest(testId) {
  const { rows } = await readSheet(SHEET_NAMES.TESTS);
  const target = rows.find((r) => String(r["테스트ID"]).trim() === String(testId).trim());
  if (!target) throw new NotFoundError("테스트를 찾을 수 없습니다.");
  await deleteRowByNumber(SHEET_NAMES.TESTS, target.__rowNumber);
}

// ---------------------------------------------------------------------------
// 관리자: 테스트 결과 (문항별 결과 포함)
// ---------------------------------------------------------------------------

export async function listTestResults({ testId, memberId } = {}) {
  const [{ rows: results }, { rows: tests }, { rows: members }] = await Promise.all([
    readSheet(SHEET_NAMES.TEST_RESULTS),
    readSheet(SHEET_NAMES.TESTS),
    readSheet(SHEET_NAMES.MEMBERS),
  ]);
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

export async function getTestResultWithQuestions(resultId) {
  const { rows: results } = await readSheet(SHEET_NAMES.TEST_RESULTS);
  const result = results.find((r) => String(r["결과ID"]).trim() === String(resultId).trim());
  if (!result) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");
  const { rows: allQuestions } = await readSheet(SHEET_NAMES.TEST_QUESTIONS);
  const questions = sortByQuestionNumber(
    allQuestions.filter((q) => String(q["결과ID"]).trim() === String(resultId).trim())
  );
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

  const { rows: existing } = await readSheet(SHEET_NAMES.TEST_RESULTS);
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
  const now = todayStr();

  await appendRow(SHEET_NAMES.TEST_RESULTS, {
    결과ID: resultId,
    테스트ID,
    구성원ID,
    총점: total,
    총평: 총평 || "",
    문항별피드백: 문항별피드백 || "",
    등록일: now,
    수정일: now,
  });

  await appendRows(
    SHEET_NAMES.TEST_QUESTIONS,
    questions.map((q) => ({
      결과ID: resultId,
      문항번호: q["문항번호"],
      배점: toNumber(q["배점"]),
      획득점수: toNumber(q["획득점수"]),
      감점여부: toNumber(q["획득점수"]) < toNumber(q["배점"]) ? "Y" : "N",
      피드백: q["피드백"] || "",
    }))
  );

  return { 결과ID: resultId, 총점: total };
}

export async function updateTestResult(resultId, data) {
  const { 총평, 문항별피드백, questions } = data;
  validateQuestions(questions);

  const { rows } = await readSheet(SHEET_NAMES.TEST_RESULTS);
  const target = rows.find((r) => String(r["결과ID"]).trim() === String(resultId).trim());
  if (!target) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");

  const total = questions.reduce((sum, q) => sum + toNumber(q["획득점수"]), 0);
  const merged = {
    ...target,
    총점: total,
    총평: 총평 ?? target["총평"],
    문항별피드백: 문항별피드백 ?? target["문항별피드백"],
    수정일: todayStr(),
  };
  await updateRowByNumber(SHEET_NAMES.TEST_RESULTS, target.__rowNumber, merged);

  // 문항별 결과는 기존 것을 전부 지우고 새로 넣는 방식으로 갱신한다.
  const { rows: allQuestions } = await readSheet(SHEET_NAMES.TEST_QUESTIONS);
  const oldRows = allQuestions.filter(
    (q) => String(q["결과ID"]).trim() === String(resultId).trim()
  );
  if (oldRows.length > 0) {
    await deleteRowsByNumbers(SHEET_NAMES.TEST_QUESTIONS, oldRows.map((r) => r.__rowNumber));
  }
  await appendRows(
    SHEET_NAMES.TEST_QUESTIONS,
    questions.map((q) => ({
      결과ID: resultId,
      문항번호: q["문항번호"],
      배점: toNumber(q["배점"]),
      획득점수: toNumber(q["획득점수"]),
      감점여부: toNumber(q["획득점수"]) < toNumber(q["배점"]) ? "Y" : "N",
      피드백: q["피드백"] || "",
    }))
  );

  return { 결과ID: resultId, 총점: total };
}

export async function deleteTestResult(resultId) {
  const { rows } = await readSheet(SHEET_NAMES.TEST_RESULTS);
  const target = rows.find((r) => String(r["결과ID"]).trim() === String(resultId).trim());
  if (!target) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");
  await deleteRowByNumber(SHEET_NAMES.TEST_RESULTS, target.__rowNumber);

  const { rows: allQuestions } = await readSheet(SHEET_NAMES.TEST_QUESTIONS);
  const oldRows = allQuestions.filter(
    (q) => String(q["결과ID"]).trim() === String(resultId).trim()
  );
  if (oldRows.length > 0) {
    await deleteRowsByNumbers(SHEET_NAMES.TEST_QUESTIONS, oldRows.map((r) => r.__rowNumber));
  }
}

// ---------------------------------------------------------------------------
// 관리자: 프로젝트 평가
// ---------------------------------------------------------------------------

export async function listProjects({ memberId } = {}) {
  const [{ rows: projects }, { rows: members }] = await Promise.all([
    readSheet(SHEET_NAMES.PROJECTS),
    readSheet(SHEET_NAMES.MEMBERS),
  ]);
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
  const { rows } = await readSheet(SHEET_NAMES.PROJECTS);
  const target = rows.find((r) => String(r["평가ID"]).trim() === String(evalId).trim());
  if (!target) throw new NotFoundError("프로젝트 평가를 찾을 수 없습니다.");
  const merged = { ...target, ...updates, 평가ID: target["평가ID"] };
  if (PROJECT_SCORE_FIELDS.some((f) => f in updates)) {
    validateProjectScores(merged);
    merged["총점"] = PROJECT_SCORE_FIELDS.reduce((s, f) => s + toNumber(merged[f]), 0);
  }
  merged["수정일"] = todayStr();
  await updateRowByNumber(SHEET_NAMES.PROJECTS, target.__rowNumber, merged);
  return merged;
}

export async function deleteProject(evalId) {
  const { rows } = await readSheet(SHEET_NAMES.PROJECTS);
  const target = rows.find((r) => String(r["평가ID"]).trim() === String(evalId).trim());
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
      errors.push(`${line}행: 이미 등록된 구성원입니다 (${name}). 이름이 같은 다른 사람이라면 헷갈리지 않도록 생년월일을 다시 확인해주세요.`);
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
    return { success: false, errors, savedCount: 0 };
  }

  let savedCount = 0;
  for (const row of parsedRows) {
    await createMember(row);
    savedCount += 1;
  }

  return { success: true, errors: [], savedCount };
}

// 강사님이 "예쁜 채점 시트"(순번,이름,총점,Q1..Qn,감점문항,문항별피드백,총평)
// 형식으로 채운 파일을 그대로 업로드할 때 사용한다. 문항 수와 배점은
// 해당 테스트ID의 "문항배점" 설정을 그대로 따른다 (파일에 적힌 값이
// 아니라 테스트 설정이 기준이라, 강사님이 배점을 잘못 옮겨 적어도
// 안전하다). 구성원은 구성원ID가 있으면 그것으로, 없으면 이름
// (+생년월일)으로 찾는다.
export async function bulkCreateTestResultsWide(testId, records) {
  const errors = [];
  const test = await findRowByField(SHEET_NAMES.TESTS, "테스트ID", testId);
  if (!test) throw new ValidationError(`존재하지 않는 테스트ID입니다: ${testId}`);
  const maxScores = parseQuestionScores(test["문항배점"]);
  if (maxScores.length === 0) {
    throw new ValidationError(
      "이 테스트에는 문항별 배점이 설정되어 있지 않습니다. 관리자 화면의 테스트 수정에서 문항배점을 먼저 입력해주세요."
    );
  }

  const [{ rows: members }, { rows: existingResults }] = await Promise.all([
    readSheet(SHEET_NAMES.MEMBERS),
    readSheet(SHEET_NAMES.TEST_RESULTS),
  ]);
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

    if (existingMemberIds.has(memberId)) {
      errors.push(`${line}행: 이미 등록된 결과입니다 (구성원ID ${memberId}). 관리자 화면에서 수정해주세요.`);
      return;
    }

    parsedRows.push({
      memberId,
      questions,
      총평: findValueByAliases(rec, ["총평"]) || "",
      문항별피드백: findValueByAliases(rec, ["문항별피드백", "문항별 피드백"]) || "",
    });
  });

  // 파일 내 중복(같은 구성원이 여러 행) 체크
  const seen = new Set();
  parsedRows.forEach((r) => {
    if (seen.has(r.memberId)) {
      errors.push(`같은 구성원(${r.memberId})의 결과가 파일 안에 여러 번 있습니다.`);
    } else {
      seen.add(r.memberId);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors, savedCount: 0 };
  }

  let savedCount = 0;
  for (const row of parsedRows) {
    await createTestResult({
      테스트ID: testId,
      구성원ID: row.memberId,
      총평: row.총평,
      문항별피드백: row.문항별피드백,
      questions: row.questions,
    });
    savedCount += 1;
  }

  return { success: true, errors: [], savedCount };
}

export async function bulkCreateProjects(records) {
  const errors = [];
  const { rows: members } = await readSheet(SHEET_NAMES.MEMBERS);
  const { rows: existingProjects } = await readSheet(SHEET_NAMES.PROJECTS);
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
      errors.push(`${line}행: 이미 등록된 평가입니다 (${projectName}).`);
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
    return { success: false, errors, savedCount: 0 };
  }

  let savedCount = 0;
  for (const row of parsedRows) {
    await createProject(row);
    savedCount += 1;
  }

  return { success: true, errors: [], savedCount };
}
