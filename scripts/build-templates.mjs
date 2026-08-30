// 배포(빌드)할 때마다 자동으로 실행되어, 프로젝트 평가용 엑셀 양식을
// public/templates/ 에 새로 만들어둔다 (package.json의 "prebuild" 참고).
// 이렇게 해두면 양식 파일을 git에 따로 커밋해둘 필요 없이 항상 최신
// 코드 기준으로 새로 생성된다.
//
// scripts/setup-sheets.mjs 와 마찬가지로, 이 스크립트는 Next.js 번들러를
// 거치지 않고 순수 Node로 바로 실행되기 때문에 lib/ 안의 파일을 import
// 하지 않고 필요한 로직만 그대로 옮겨서 자체적으로 동작하게 만들었다.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_MAX_PER_ITEM = 5;
const TITLE_FILL = "FF2F5597";
const HEADER_FILL = "FFD9E1F2";
const THIN = { style: "thin", color: { argb: "FFB7B7B7" } };
const EMPTY_DATA_ROWS = 30;

async function buildProjectEvaluationWorkbook() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("프로젝트 평가");

  const columns = [
    { header: "구분", key: "no", width: 6 },
    { header: "성명", key: "name", width: 10 },
    { header: "생년월일(선택, 동명이인 구분용)", key: "birth", width: 22 },
    { header: "프로젝트명(선택)", key: "project", width: 18 },
    { header: "발표일(선택)", key: "date", width: 12 },
    { header: "강사명(선택)", key: "instructor", width: 12 },
    { header: `기술 활용도(${PROJECT_MAX_PER_ITEM}점)`, key: "s1", width: 14 },
    { header: `기능 구현&안정성(${PROJECT_MAX_PER_ITEM}점)`, key: "s2", width: 16 },
    { header: `문제 해결(${PROJECT_MAX_PER_ITEM}점)`, key: "s3", width: 14 },
    { header: `발표 전달&명확성(${PROJECT_MAX_PER_ITEM}점)`, key: "s4", width: 16 },
    { header: "평가 코멘트", key: "comment", width: 42 },
  ];
  sheet.columns = columns;
  const totalColCount = columns.length;

  sheet.insertRow(1, []);
  sheet.mergeCells(1, 1, 1, totalColCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "프로젝트 평가";
  titleCell.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
  sheet.getRow(1).height = 26;

  const headerRowIndex = 2;
  const headerRow = sheet.getRow(headerRowIndex);
  for (let c = 1; c <= totalColCount; c += 1) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  }
  headerRow.height = 30;
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: totalColCount },
  };
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: headerRowIndex }];

  const scoreCols = [7, 8, 9, 10];
  for (let i = 0; i < EMPTY_DATA_ROWS; i += 1) {
    const r = headerRowIndex + 1 + i;
    const row = sheet.getRow(r);
    row.getCell(1).value = i + 1;
    for (const c of scoreCols) {
      const cell = row.getCell(c);
      cell.dataValidation = {
        type: "whole",
        operator: "between",
        formulae: [0, PROJECT_MAX_PER_ITEM],
        showErrorMessage: true,
        errorTitle: "점수 범위 오류",
        error: `0~${PROJECT_MAX_PER_ITEM} 사이의 숫자만 입력할 수 있습니다.`,
      };
    }
    for (let c = 1; c <= totalColCount; c += 1) {
      row.getCell(c).border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    }
  }

  return wb;
}

async function buildMembersWorkbook() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("구성원 명단");

  const columns = [
    { header: "구분", key: "no", width: 6 },
    { header: "이름", key: "name", width: 12 },
    { header: "생년월일(필수, 예: 1998-05-06)", key: "birth", width: 24 },
    { header: "과정명(선택)", key: "course", width: 16 },
    { header: "기수(선택)", key: "cohort", width: 10 },
    { header: "상태(선택, 기본값 과정 진행중)", key: "status", width: 16 },
  ];
  sheet.columns = columns;
  const totalColCount = columns.length;

  sheet.insertRow(1, []);
  sheet.mergeCells(1, 1, 1, totalColCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "구성원 명단";
  titleCell.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
  sheet.getRow(1).height = 26;

  const headerRowIndex = 2;
  const headerRow = sheet.getRow(headerRowIndex);
  for (let c = 1; c <= totalColCount; c += 1) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  }
  headerRow.height = 30;
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: totalColCount },
  };
  sheet.views = [{ state: "frozen", xSplit: 2, ySplit: headerRowIndex }];

  // 생년월일 칸은 숫자로 인식되어 앞자리 0이 사라지는 사고를 막기 위해
  // 텍스트 서식으로 미리 지정해둔다.
  sheet.getColumn(3).numFmt = "@";

  for (let i = 0; i < EMPTY_DATA_ROWS; i += 1) {
    const r = headerRowIndex + 1 + i;
    const row = sheet.getRow(r);
    row.getCell(1).value = i + 1;
    for (let c = 1; c <= totalColCount; c += 1) {
      row.getCell(c).border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
    }
  }

  return wb;
}

async function main() {
  const outDir = path.join(__dirname, "..", "public", "templates");
  await mkdir(outDir, { recursive: true });

  const projectWb = await buildProjectEvaluationWorkbook();
  const projectBuffer = await projectWb.xlsx.writeBuffer();
  const projectPath = path.join(outDir, "project-evaluations-template.xlsx");
  await writeFile(projectPath, projectBuffer);
  console.log(`[build-templates] ${projectPath} 생성 완료`);

  const membersWb = await buildMembersWorkbook();
  const membersBuffer = await membersWb.xlsx.writeBuffer();
  const membersPath = path.join(outDir, "members-template.xlsx");
  await writeFile(membersPath, membersBuffer);
  console.log(`[build-templates] ${membersPath} 생성 완료`);
}

main().catch((err) => {
  console.error("[build-templates] 실패:", err);
  process.exit(1);
});
