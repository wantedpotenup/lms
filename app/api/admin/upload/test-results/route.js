import { NextResponse } from "next/server";
import { parseUploadFile } from "@/lib/uploadParse";
import { bulkCreateTestResultsWide, ValidationError } from "@/lib/data";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const testId = String(formData.get("테스트ID") || "").trim();
    if (!testId) {
      return NextResponse.json({ error: "먼저 어떤 테스트의 결과인지 선택해주세요." }, { status: 400 });
    }
    const records = await parseUploadFile(file);
    if (records.length === 0) {
      return NextResponse.json({ error: "파일에 데이터가 없습니다." }, { status: 400 });
    }
    const result = await bulkCreateTestResultsWide(testId, records);
    if (!result.success) {
      return NextResponse.json({ error: "업로드 파일에 오류가 있어 저장하지 않았습니다.", details: result.errors }, { status: 400 });
    }
    return NextResponse.json({ ok: true, savedCount: result.savedCount, skipped: result.skipped || [] });
  } catch (err) {
    console.error(err);
    const status = err instanceof ValidationError ? 400 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
