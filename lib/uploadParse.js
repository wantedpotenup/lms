// 관리자가 업로드하는 CSV/Excel 파일을 행(객체) 배열로 변환한다.
import * as XLSX from "xlsx";

export async function parseUploadFile(file) {
  if (!file) throw new Error("업로드할 파일을 선택해주세요.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  // defval: "" 로 빈 셀도 키가 유지되도록 한다.
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}
