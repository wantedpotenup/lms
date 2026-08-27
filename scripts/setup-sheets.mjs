// 사용법: npm run setup-sheets
// .env.local 에 채워둔 정보로 구글 시트에 접속해서, 필요한 5개 탭(구성원/테스트/
// 테스트결과/테스트문항결과/프로젝트평가)이 없으면 만들고 헤더(첫 줄)를 채워준다.
// 이미 데이터가 있는 탭은 건드리지 않는다.

import { config as loadEnv } from "dotenv";
import { google } from "googleapis";

loadEnv({ path: ".env.local" });

const SHEET_NAMES = {
  MEMBERS: "구성원",
  TESTS: "테스트",
  TEST_RESULTS: "테스트결과",
  TEST_QUESTIONS: "테스트문항결과",
  PROJECTS: "프로젝트평가",
};

const HEADERS = {
  [SHEET_NAMES.MEMBERS]: ["구성원ID", "이름", "생년월일", "과정명", "기수", "상태"],
  [SHEET_NAMES.TESTS]: ["테스트ID", "테스트명", "과정명", "기수", "응시일", "만점", "공개여부"],
  [SHEET_NAMES.TEST_RESULTS]: ["결과ID", "테스트ID", "구성원ID", "총점", "총평", "등록일", "수정일"],
  [SHEET_NAMES.TEST_QUESTIONS]: ["결과ID", "문항번호", "배점", "획득점수", "감점여부", "피드백"],
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

async function main() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !rawKey || !spreadsheetId) {
    console.error(
      "❌ .env.local 에 GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID 값이 모두 채워져 있는지 확인해주세요."
    );
    process.exit(1);
  }

  const key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("구글 시트에 접속하는 중...");
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set(meta.data.sheets.map((s) => s.properties.title));

  const toCreate = Object.values(SHEET_NAMES).filter((name) => !existingTitles.has(name));

  if (toCreate.length > 0) {
    console.log(`새로 만들 탭: ${toCreate.join(", ")}`);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  } else {
    console.log("모든 탭이 이미 존재합니다.");
  }

  for (const name of Object.values(SHEET_NAMES)) {
    const existingValues = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: name,
    });
    const hasHeader = (existingValues.data.values || []).length > 0;
    if (hasHeader) {
      console.log(`- "${name}" 탭: 이미 내용이 있어 그대로 둡니다.`);
      continue;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${name}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS[name]] },
    });
    console.log(`✔ "${name}" 탭에 헤더를 추가했습니다.`);
  }

  console.log("\n완료되었습니다! 이제 구글 시트에 구성원/테스트 데이터를 입력하거나,");
  console.log("관리자 화면(/admin)에서 등록을 시작할 수 있습니다.");
}

main().catch((err) => {
  console.error("❌ 오류가 발생했습니다:", err.message);
  process.exit(1);
});
