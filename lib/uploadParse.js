// 관리자가 업로드하는 CSV/Excel 파일을 행(객체) 배열로 변환한다.
//
// 우리가 만들어주는 "예쁜" 채점/평가/명단 시트는 맨 위에 제목 줄(파란
// 띠), 안내 줄 같은 게 있고 그 아래에 진짜 헤더(이름, 생년월일 ...)가
// 나온다. 제목 줄은 셀 병합 때문에 실제로는 한 칸(A열)에만 값이 있고
// 나머지 칸은 비어있는데, 만약 무조건 "1행 = 헤더"로 가정해버리면 제목
// 줄을 헤더로 착각해서 진짜 데이터가 전부 엉뚱한 컬럼명(__EMPTY_1 등)
// 아래로 들어가버린다. 그래서 실제로 값이 여러 칸에 걸쳐 채워진 첫 번째
// 행을 진짜 헤더로 판단한다.
import * as XLSX from "xlsx";

function isFilled(cell) {
  return String(cell ?? "").trim() !== "";
}

export async function parseUploadFile(file) {
  if (!file) throw new Error("업로드할 파일을 선택해주세요.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];

  // 우선 헤더 없이 순수 2차원 배열로 읽어서, 값이 여러 칸에 걸쳐 채워진
  // 첫 번째 행을 진짜 헤더 행으로 찾는다 (제목처럼 한 칸만 채워진 행은
  // 건너뛴다).
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const headerRowIndex = rows.findIndex((row) => row.filter(isFilled).length >= 2);
  if (headerRowIndex === -1) return [];

  const header = rows[headerRowIndex].map((h) => String(h ?? "").trim());
  const dataRows = rows.slice(headerRowIndex + 1);

  return dataRows
    .filter((row) => row.some(isFilled))
    .map((row) => {
      const obj = {};
      header.forEach((h, i) => {
        if (!h) return; // 헤더가 비어있는 칸(장식용 여백 등)은 무시
        obj[h] = row[i] !== undefined ? row[i] : "";
      });
      return obj;
    });
}
