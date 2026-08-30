// Google Sheets API를 다루는 가장 아래 계층.
// 이 파일은 "시트 이름 -> 값" 수준의 범용 읽기/쓰기/삭제만 담당하고,
// 실제 도메인 로직(구성원, 테스트 등)은 lib/data.js 에서 처리한다.

import { google } from "googleapis";
import { PROJECT_SCORE_ALIASES } from "./schema";

let cachedClient = null;
let cachedSheetIdMap = null;

// 비교용으로 공백과 특수문자를 제거한 "느슨한" 문자열을 만든다.
// (lib/uploadMatch.js 의 normalizeHeaderKey와 동일한 규칙 — 이 파일은
// 순환 참조를 피하기 위해 별도로 가지고 있다.)
function normalizeHeaderKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s()&./_-]/g, "");
}

// rowObject는 "정식 필드명"(예: 공개여부, 기술활용도)을 키로 가지고 있는데,
// 관리자가 실제 구글 시트의 헤더 글자를 보기 좋게 꾸며두면(공백 추가,
// "(5점)" 같은 안내 문구, 혹은 "완성도" 대신 "&안정성"처럼 아예 다른 표현)
// 완전히 똑같은 글자가 아니라서 값을 못 찾고 빈 칸으로 저장되는 사고를
// 막기 위한 함수. 정확히 같은 키가 있으면 그걸 쓰고, 없으면 느슨하게 비교해서
// 찾는다.
function resolveHeaderValue(header, rowObject) {
  if (rowObject[header] !== undefined) return rowObject[header];
  const normalizedHeader = normalizeHeaderKey(header);
  if (!normalizedHeader) return "";

  const candidateKeys = Object.keys(rowObject).sort((a, b) => b.length - a.length);
  for (const key of candidateKeys) {
    const normalizedKey = normalizeHeaderKey(key);
    if (normalizedKey && normalizedHeader.startsWith(normalizedKey)) {
      return rowObject[key];
    }
  }
  // 완성도/안정성 처럼 글자 자체가 다른 별칭들도 확인한다.
  for (const [field, aliases] of Object.entries(PROJECT_SCORE_ALIASES)) {
    if (rowObject[field] === undefined) continue;
    for (const alias of aliases) {
      if (normalizedHeader.startsWith(normalizeHeaderKey(alias))) {
        return rowObject[field];
      }
    }
  }
  return "";
}

function getCredentials() {
  // 방법 1 (권장): 다운로드한 JSON 키 파일 내용을 통째로 GOOGLE_SERVICE_ACCOUNT_JSON 에 붙여넣는 방식.
  // private_key 를 따로 잘라 붙이다 줄바꿈이 깨지는 사고가 훨씬 적어서 이 방법을 우선한다.
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON 값을 해석할 수 없습니다. 다운로드한 JSON 키 파일의 내용을 처음 { 부터 마지막 } 까지 그대로 붙여넣었는지 확인해주세요."
      );
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON 안에 client_email 또는 private_key 값이 없습니다. JSON 키 파일 전체를 붙여넣었는지 확인해주세요."
      );
    }
    return { email: parsed.client_email, key: parsed.private_key };
  }

  // 방법 2: 이메일/키를 각각 별도 환경변수로 넣는 방식 (예전 방식, 계속 지원).
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "구글 서비스 계정 정보가 없습니다. GOOGLE_SERVICE_ACCOUNT_JSON (권장) 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY 환경변수를 설정해주세요."
    );
  }
  // 따옴표로 감싼 채로 붙여넣은 경우 그 따옴표까지 값에 포함되는 사고를 방지한다.
  const trimmed = rawKey.trim();
  const unquoted =
    trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
  // Vercel 등에서는 개행문자가 \n 문자열로 저장되므로 실제 개행으로 변환한다.
  const key = unquoted.includes("\\n") ? unquoted.replace(/\\n/g, "\n") : unquoted;
  return { email, key };
}

function getAuth() {
  const { email, key } = getCredentials();
  if (!key.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "구글 서비스 계정 키 형식이 올바르지 않습니다 (-----BEGIN PRIVATE KEY----- 로 시작해야 함). GOOGLE_SERVICE_ACCOUNT_JSON에 JSON 키 파일 전체 내용을 다시 붙여넣어 보세요."
    );
  }
  return new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetsClient() {
  if (cachedClient) return cachedClient;
  const auth = getAuth();
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) {
    throw new Error(
      "GOOGLE_SHEET_ID 환경변수가 설정되어 있지 않습니다. .env.local 또는 Vercel 환경변수를 확인해주세요."
    );
  }
  return id;
}

// 시트의 원시 값(2차원 배열)을 헤더 기준 객체 배열로 변환한다.
// __rowNumber 는 시트 상의 실제 행 번호(1-base, 헤더 포함)이며 수정/삭제 시 사용한다.
function rowsToObjects(values) {
  if (!values || values.length === 0) return { header: [], rows: [] };
  const [header, ...dataRows] = values;
  const rows = dataRows
    .filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""))
    .map((r, idx) => {
      const obj = { __rowNumber: idx + 2 };
      header.forEach((h, i) => {
        obj[h] = r[i] !== undefined ? r[i] : "";
      });
      return obj;
    });
  return { header, rows };
}

export async function readSheet(sheetName) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
      // 화면에 표시되는 그대로(문자열)를 가져온다. 날짜/숫자 서식이 달라도
      // 항상 일관된 문자열로 받아서 다루기 위함이다. 숫자 계산이 필요한 곳은
      // lib/format.js 의 toNumber() 로 파싱한다.
      valueRenderOption: "FORMATTED_VALUE",
    });
  } catch (err) {
    throw new Error(
      `"${sheetName}" 시트를 읽는 중 오류가 발생했습니다. 시트 이름과 공유 설정을 확인해주세요. (${err.message})`
    );
  }
  return rowsToObjects(res.data.values || []);
}

// 실제로 시트 1행에 적혀있는 헤더(컬럼명)를 그대로 읽어온다.
// 관리자가 구글 시트에서 컬럼 순서를 바꾸더라도, 쓰기 작업이 "몇 번째 칸"이
// 아니라 "이 헤더 이름의 칸"을 찾아서 값을 넣도록 하기 위함이다.
async function getActualHeader(sheetName) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
    valueRenderOption: "FORMATTED_VALUE",
  });
  const header = (res.data.values || [[]])[0] || [];
  if (header.length === 0) {
    throw new Error(
      `"${sheetName}" 시트의 첫 번째 줄(헤더)이 비어있습니다. 컬럼명을 입력해주세요.`
    );
  }
  return header;
}

export async function appendRows(sheetName, rowObjects) {
  if (!rowObjects || rowObjects.length === 0) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const header = await getActualHeader(sheetName);
  const values = rowObjects.map((rowObject) => header.map((h) => resolveHeaderValue(h, rowObject) ?? ""));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetName,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

export async function appendRow(sheetName, rowObject) {
  return appendRows(sheetName, [rowObject]);
}

export async function updateRowByNumber(sheetName, rowNumber, rowObject) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const header = await getActualHeader(sheetName);
  const values = [header.map((h) => resolveHeaderValue(h, rowObject) ?? "")];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

async function getSheetIdMap() {
  if (cachedSheetIdMap) return cachedSheetIdMap;
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  cachedSheetIdMap = {};
  for (const s of meta.data.sheets) {
    cachedSheetIdMap[s.properties.title] = s.properties.sheetId;
  }
  return cachedSheetIdMap;
}

// rowNumbers: 삭제할 시트 행 번호 배열 (1-base, 헤더 포함). 순서는 상관없이 넣어도 된다.
export async function deleteRowsByNumbers(sheetName, rowNumbers) {
  if (!rowNumbers || rowNumbers.length === 0) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const idMap = await getSheetIdMap();
  const sheetId = idMap[sheetName];
  if (sheetId === undefined) {
    throw new Error(`"${sheetName}" 시트를 찾을 수 없습니다.`);
  }
  // 큰 행 번호부터 지워야 앞선 삭제가 뒤 행 번호에 영향을 주지 않는다.
  const sorted = [...new Set(rowNumbers)].sort((a, b) => b - a);
  const requests = sorted.map((rowNumber) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: "ROWS",
        startIndex: rowNumber - 1,
        endIndex: rowNumber,
      },
    },
  }));
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

export async function deleteRowByNumber(sheetName, rowNumber) {
  return deleteRowsByNumbers(sheetName, [rowNumber]);
}
