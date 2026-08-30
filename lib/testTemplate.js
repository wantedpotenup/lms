// 강사님이 채점할 때 쓰기 좋은, 보기 예쁜 엑셀 채점 시트를 만든다.
// 문항 수와 문항별 배점은 해당 테스트의 "문항배점" 설정을 그대로 따른다.
import ExcelJS from "exceljs";
import { parseQuestionScores } from "./data";

const TITLE_FILL = "FF2F5597";
const INFO_FILL = "FFE2EFDA";
const HEADER_FILL = "FFD9E1F2";
const THIN = { style: "thin", color: { argb: "FFB7B7B7" } };
const EMPTY_DATA_ROWS = 30;

function colLetter(n) {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

export async function buildTestGradingWorkbook(test) {
  const maxScores = parseQuestionScores(test["문항배점"]);
  if (maxScores.length === 0) {
    throw new Error("이 테스트에는 문항별 배점이 설정되어 있지 않습니다.");
  }
  const n = maxScores.length;

  const wb = new ExcelJS.Workbook();
  const rawName = String(test["테스트명"] || "채점시트");
  const sheetName = rawName.replace(/[\\/*?:[\]]/g, "").slice(0, 28) || "채점시트";
  const sheet = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 0 }] });

  const baseCols = [
    { header: "순번", key: "no", width: 6 },
    { header: "이름", key: "name", width: 10 },
    { header: "생년월일(선택, 동명이인 구분용)", key: "birth", width: 22 },
    { header: "총점(자동계산)", key: "total", width: 12 },
  ];
  const qCols = maxScores.map((max, i) => ({
    header: `Q${i + 1}(${max}점)`,
    key: `q${i + 1}`,
    width: 8,
  }));
  const tailCols = [
    { header: "감점 문항(참고용)", key: "deducted", width: 20 },
    { header: "문항별피드백", key: "feedback", width: 42 },
    { header: "총평", key: "summary", width: 32 },
  ];
  const columns = [...baseCols, ...qCols, ...tailCols];
  sheet.columns = columns; // 이 시점에 1행이 헤더로 자동 채워진다.
  const totalColCount = columns.length;
  const qStartCol = baseCols.length + 1;
  const qEndCol = qStartCol + n - 1;

  // 위에서부터 제목 -> 배점 정보 -> (선택)채점기준 -> 헤더 순서로 밀어 넣는다.
  sheet.insertRow(1, []);
  sheet.mergeCells(1, 1, 1, totalColCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${test["테스트명"] || ""} 채점 결과`;
  titleCell.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
  sheet.getRow(1).height = 26;

  sheet.insertRow(2, []);
  sheet.mergeCells(2, 1, 2, totalColCount);
  const infoCell = sheet.getCell(2, 1);
  const weightText = maxScores.map((m, i) => `Q${i + 1} ${m}`).join(", ");
  infoCell.value = `총점 ${test["만점"] || ""}점  |  배점: ${weightText}`;
  infoCell.font = { bold: true };
  infoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INFO_FILL } };
  infoCell.alignment = { horizontal: "left", vertical: "middle" };
  sheet.getRow(2).height = 20;

  let headerRowIndex = 3;
  if (test["채점기준"]) {
    sheet.insertRow(3, []);
    sheet.mergeCells(3, 1, 3, totalColCount);
    const critCell = sheet.getCell(3, 1);
    critCell.value = `채점 기준: ${test["채점기준"]}`;
    critCell.font = { italic: true, size: 10 };
    critCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    sheet.getRow(3).height = 30;
    headerRowIndex = 4;
  }

  const headerRow = sheet.getRow(headerRowIndex);
  for (let c = 1; c <= totalColCount; c += 1) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  }
  headerRow.height = 26;
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: totalColCount },
  };
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: headerRowIndex }];

  for (let i = 0; i < EMPTY_DATA_ROWS; i += 1) {
    const r = headerRowIndex + 1 + i;
    const row = sheet.getRow(r);
    row.getCell(1).value = i + 1; // 순번
    const totalCell = row.getCell(4);
    totalCell.value = { formula: `SUM(${colLetter(qStartCol)}${r}:${colLetter(qEndCol)}${r})` };
    totalCell.font = { bold: true };
    for (let qi = 0; qi < n; qi += 1) {
      const cell = row.getCell(qStartCol + qi);
      cell.dataValidation = {
        type: "whole",
        operator: "between",
        formulae: [0, maxScores[qi]],
        showErrorMessage: true,
        errorTitle: "점수 범위 오류",
        error: `0~${maxScores[qi]} 사이의 숫자만 입력할 수 있습니다.`,
      };
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    }
    for (let c = 1; c <= totalColCount; c += 1) {
      row.getCell(c).border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    }
  }

  return wb;
}
