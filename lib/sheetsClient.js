// Google Sheets API를 다루는 가장 아래 계층.
// 이 파일은 "시트 이름 -> 값" 수준의 범용 읽기/쓰기/삭제만 담당하고,
// 실제 도메인 로직(구성원, 테스트 등)은 lib/data.js 에서 처리한다.

import { google } from "googleapis";

let cachedClient = null;
let cachedSheetIdMap = null;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 환경변수가 설정되어 있지 않습니다. .env.local 또는 Vercel 환경변수를 확인해주세요."
    );
  }
  // Vercel 등에서는 개행문자가 \n 문자열로 저장되므로 실제 개행으로 변환한다.
  const key = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
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

export async function appendRows(sheetName, header, rowObjects) {
  if (!rowObjects || rowObjects.length === 0) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const values = rowObjects.map((rowObject) => header.map((h) => rowObject[h] ?? ""));
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: sheetName,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values },
  });
}

export async function appendRow(sheetName, header, rowObject) {
  return appendRows(sheetName, header, [rowObject]);
}

export async function updateRowByNumber(sheetName, header, rowNumber, rowObject) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const values = [header.map((h) => rowObject[h] ?? "")];
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
