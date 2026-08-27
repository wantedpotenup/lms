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
import { SHEET_NAMES, HEADERS, PROJECT_SCORE_FIELDS, PROJECT_MAX_PER_ITEM } from "./schema";
import {
  normalizeDigits,
  isPublicValue,
  todayStr,
  toNumber,
  isDeducted,
  sortByQuestionNumber,
  generateId,
} from "./format";

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
  const header = HEADERS[SHEET_NAMES.MEMBERS];
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
  await appendRow(SHEET_NAMES.MEMBERS, header, row);
  return row;
}

export async function updateMember(memberId, updates) {
  const header = HEADERS[SHEET_NAMES.MEMBERS];
  const { rows } = await readSheet(SHEET_NAMES.MEMBERS);
  const target = rows.find((r) => String(r["구성원ID"]).trim() === String(memberId).trim());
  if (!target) throw new NotFoundError("구성원을 찾을 수 없습니다.");
  const merged = { ...target, ...updates, 구성원ID: target["구성원ID"] };
  await updateRowByNumber(SHEET_NAMES.MEMBERS, header, target.__rowNumber, merged);
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

export async function listTests({ courseName, cohort } = {}) {
  const { rows } = await readSheet(SHEET_NAMES.TESTS);
  return rows.filter((t) => {
    if (courseName && String(t["과정명"]).trim() !== courseName.trim()) return false;
    if (cohort && String(t["기수"]).trim() !== cohort.trim()) return false;
    return true;
  });
}

export async function createTest(data) {
  const header = HEADERS[SHEET_NAMES.TESTS];
  if (!data["테스트명"] || !data["만점"]) {
    throw new ValidationError("테스트명과 만점은 필수입니다.");
  }
  const row = {
    테스트ID: data["테스트ID"] || generateId("T"),
    테스트명: data["테스트명"],
    과정명: data["과정명"] || "",
    기수: data["기수"] || "",
    응시일: data["응시일"] || "",
    만점: data["만점"],
    공개여부: data["공개여부"] || "비공개",
  };
  await appendRow(SHEET_NAMES.TESTS, header, row);
  return row;
}

export async function updateTest(testId, updates) {
  const header = HEADERS[SHEET_NAMES.TESTS];
  const { rows } = await readSheet(SHEET_NAMES.TESTS);
  const target = rows.find((r) => String(r["테스트ID"]).trim() === String(testId).trim());
  if (!target) throw new NotFoundError("테스트를 찾을 수 없습니다.");
  const merged = { ...target, ...updates, 테스트ID: target["테스트ID"] };
  await updateRowByNumber(SHEET_NAMES.TESTS, header, target.__rowNumber, merged);
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
  const { 테스트ID, 구성원ID, 총평, questions } = data;
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

  await appendRow(SHEET_NAMES.TEST_RESULTS, HEADERS[SHEET_NAMES.TEST_RESULTS], {
    결과ID: resultId,
    테스트ID,
    구성원ID,
    총점: total,
    총평: 총평 || "",
    등록일: now,
    수정일: now,
  });

  await appendRows(
    SHEET_NAMES.TEST_QUESTIONS,
    HEADERS[SHEET_NAMES.TEST_QUESTIONS],
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
  const { 총평, questions } = data;
  validateQuestions(questions);

  const header = HEADERS[SHEET_NAMES.TEST_RESULTS];
  const { rows } = await readSheet(SHEET_NAMES.TEST_RESULTS);
  const target = rows.find((r) => String(r["결과ID"]).trim() === String(resultId).trim());
  if (!target) throw new NotFoundError("테스트 결과를 찾을 수 없습니다.");

  const total = questions.reduce((sum, q) => sum + toNumber(q["획득점수"]), 0);
  const merged = {
    ...target,
    총점: total,
    총평: 총평 ?? target["총평"],
    수정일: todayStr(),
  };
  await updateRowByNumber(SHEET_NAMES.TEST_RESULTS, header, target.__rowNumber, merged);

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
    HEADERS[SHEET_NAMES.TEST_QUESTIONS],
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
  await appendRow(SHEET_NAMES.PROJECTS, HEADERS[SHEET_NAMES.PROJECTS], row);
  return row;
}

export async function updateProject(evalId, updates) {
  const header = HEADERS[SHEET_NAMES.PROJECTS];
  const { rows } = await readSheet(SHEET_NAMES.PROJECTS);
  const target = rows.find((r) => String(r["평가ID"]).trim() === String(evalId).trim());
  if (!target) throw new NotFoundError("프로젝트 평가를 찾을 수 없습니다.");
  const merged = { ...target, ...updates, 평가ID: target["평가ID"] };
  if (PROJECT_SCORE_FIELDS.some((f) => f in updates)) {
    validateProjectScores(merged);
    merged["총점"] = PROJECT_SCORE_FIELDS.reduce((s, f) => s + toNumber(merged[f]), 0);
  }
  merged["수정일"] = todayStr();
  await updateRowByNumber(SHEET_NAMES.PROJECTS, header, target.__rowNumber, merged);
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

export async function bulkCreateTestResults(records) {
  // records: [{ 테스트ID, 구성원ID, 문항번호, 배점, 획득점수, 피드백, 총평 }, ...]
  const errors = [];
  const [{ rows: tests }, { rows: members }, { rows: existingResults }] = await Promise.all([
    readSheet(SHEET_NAMES.TESTS),
    readSheet(SHEET_NAMES.MEMBERS),
    readSheet(SHEET_NAMES.TEST_RESULTS),
  ]);
  const testIds = new Set(tests.map((t) => String(t["테스트ID"]).trim()));
  const memberIds = new Set(members.map((m) => String(m["구성원ID"]).trim()));
  const existingKeys = new Set(
    existingResults.map((r) => `${String(r["테스트ID"]).trim()}::${String(r["구성원ID"]).trim()}`)
  );

  records.forEach((rec, idx) => {
    const line = idx + 2; // 1행은 헤더
    const testId = String(rec["테스트ID"] ?? "").trim();
    const memberId = String(rec["구성원ID"] ?? "").trim();
    const qNum = String(rec["문항번호"] ?? "").trim();
    if (!testId || !memberId || !qNum || rec["배점"] === undefined || rec["배점"] === "" || rec["획득점수"] === undefined || rec["획득점수"] === "") {
      errors.push(`${line}행: 필수값(테스트ID, 구성원ID, 문항번호, 배점, 획득점수)이 비어있습니다.`);
      return;
    }
    if (!testIds.has(testId)) errors.push(`${line}행: 존재하지 않는 테스트ID입니다 (${testId}).`);
    if (!memberIds.has(memberId)) errors.push(`${line}행: 존재하지 않는 구성원ID입니다 (${memberId}).`);
    const max = toNumber(rec["배점"], null);
    const earned = toNumber(rec["획득점수"], null);
    if (max === null || max < 0) errors.push(`${line}행: 배점이 올바르지 않습니다.`);
    if (earned === null || earned < 0 || (max !== null && earned > max)) {
      errors.push(`${line}행: 획득점수(${rec["획득점수"]})가 배점(${rec["배점"]}) 범위를 벗어났습니다.`);
    }
    if (existingKeys.has(`${testId}::${memberId}`)) {
      errors.push(`${line}행: 이미 등록된 결과입니다 (테스트ID ${testId}, 구성원ID ${memberId}). 관리자 화면에서 수정해주세요.`);
    }
  });

  // 파일 내부 중복(같은 테스트+구성원+문항번호) 체크
  const seen = new Map();
  records.forEach((rec, idx) => {
    const line = idx + 2;
    const key = `${rec["테스트ID"]}::${rec["구성원ID"]}::${rec["문항번호"]}`;
    if (seen.has(key)) {
      errors.push(`${line}행: 파일 내에서 중복된 데이터입니다 (${seen.get(key)}행과 동일한 테스트/구성원/문항번호).`);
    } else {
      seen.set(key, line);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors, savedCount: 0 };
  }

  // 그룹핑: 테스트ID + 구성원ID
  const groups = new Map();
  for (const rec of records) {
    const key = `${rec["테스트ID"]}::${rec["구성원ID"]}`;
    if (!groups.has(key)) {
      groups.set(key, {
        테스트ID: String(rec["테스트ID"]).trim(),
        구성원ID: String(rec["구성원ID"]).trim(),
        총평: rec["총평"] || "",
        questions: [],
      });
    }
    const g = groups.get(key);
    if (!g["총평"] && rec["총평"]) g["총평"] = rec["총평"];
    g.questions.push({
      문항번호: rec["문항번호"],
      배점: rec["배점"],
      획득점수: rec["획득점수"],
      피드백: rec["피드백"] || "",
    });
  }

  let savedCount = 0;
  for (const group of groups.values()) {
    await createTestResult(group);
    savedCount += 1;
  }

  return { success: true, errors: [], savedCount };
}

export async function bulkCreateProjects(records) {
  const errors = [];
  const { rows: members } = await readSheet(SHEET_NAMES.MEMBERS);
  const memberIds = new Set(members.map((m) => String(m["구성원ID"]).trim()));
  const { rows: existingProjects } = await readSheet(SHEET_NAMES.PROJECTS);
  const existingKeys = new Set(
    existingProjects.map(
      (p) => `${String(p["구성원ID"]).trim()}::${String(p["프로젝트명"]).trim()}`
    )
  );

  records.forEach((rec, idx) => {
    const line = idx + 2;
    const memberId = String(rec["구성원ID"] ?? "").trim();
    const projectName = String(rec["프로젝트명"] ?? "").trim();
    if (!memberId || !projectName) {
      errors.push(`${line}행: 구성원ID와 프로젝트명은 필수입니다.`);
      return;
    }
    if (!memberIds.has(memberId)) errors.push(`${line}행: 존재하지 않는 구성원ID입니다 (${memberId}).`);
    for (const field of PROJECT_SCORE_FIELDS) {
      const v = toNumber(rec[field], null);
      if (rec[field] === undefined || rec[field] === "" || v === null || v < 0 || v > PROJECT_MAX_PER_ITEM) {
        errors.push(`${line}행: ${field} 점수는 0~${PROJECT_MAX_PER_ITEM} 사이의 값이어야 합니다.`);
      }
    }
    if (existingKeys.has(`${memberId}::${projectName}`)) {
      errors.push(`${line}행: 이미 등록된 평가입니다 (구성원ID ${memberId}, 프로젝트명 ${projectName}).`);
    }
  });

  const seen = new Map();
  records.forEach((rec, idx) => {
    const line = idx + 2;
    const key = `${rec["구성원ID"]}::${rec["프로젝트명"]}`;
    if (seen.has(key)) {
      errors.push(`${line}행: 파일 내에서 중복된 데이터입니다 (${seen.get(key)}행과 동일한 구성원/프로젝트명).`);
    } else {
      seen.set(key, line);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors, savedCount: 0 };
  }

  let savedCount = 0;
  for (const rec of records) {
    await createProject(rec);
    savedCount += 1;
  }

  return { success: true, errors: [], savedCount };
}
