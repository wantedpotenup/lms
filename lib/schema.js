// Google Sheets에 사용되는 시트 이름과 각 시트의 컬럼(헤더) 정의.
// 요구사항 정의서 8장의 구조를 그대로 따른다.
// 시트나 컬럼 이름이 바뀌면 이 파일만 수정하면 되도록 한 곳에 모아둔다.

export const SHEET_NAMES = {
  MEMBERS: "구성원",
  TESTS: "테스트",
  TEST_RESULTS: "테스트결과",
  TEST_QUESTIONS: "테스트문항결과",
  PROJECTS: "프로젝트평가",
};

export const HEADERS = {
  [SHEET_NAMES.MEMBERS]: ["구성원ID", "이름", "생년월일", "과정명", "기수", "상태"],
  [SHEET_NAMES.TESTS]: [
    "테스트ID",
    "테스트명",
    "과정명",
    "기수",
    "응시일",
    "만점",
    "공개여부",
  ],
  [SHEET_NAMES.TEST_RESULTS]: [
    "결과ID",
    "테스트ID",
    "구성원ID",
    "총점",
    "총평",
    "등록일",
    "수정일",
  ],
  [SHEET_NAMES.TEST_QUESTIONS]: [
    "결과ID",
    "문항번호",
    "배점",
    "획득점수",
    "감점여부",
    "피드백",
  ],
  [SHEET_NAMES.PROJECTS]: [
    "평가ID",
    "구성원ID",
    "프로젝트명",
    "발표일",
    "강사명",
    "기술활용도",
    "기능구현완성도",
    "문제해결",
    "발표전달력",
    "총점",
    "평가코멘트",
    "공개여부",
    "등록일",
    "수정일",
  ],
};

export const PROJECT_SCORE_FIELDS = [
  "기술활용도",
  "기능구현완성도",
  "문제해결",
  "발표전달력",
];

export const PROJECT_SCORE_LABELS = {
  기술활용도: "기술 활용도",
  기능구현완성도: "기능 구현 완성도",
  문제해결: "문제 해결",
  발표전달력: "발표 전달력 & 명확성",
};

export const PROJECT_MAX_PER_ITEM = 5;
export const PROJECT_MAX_TOTAL = PROJECT_SCORE_FIELDS.length * PROJECT_MAX_PER_ITEM;
