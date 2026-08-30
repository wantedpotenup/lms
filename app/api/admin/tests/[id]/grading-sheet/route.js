import { NextResponse } from "next/server";
import { getTest, NotFoundError, ValidationError } from "@/lib/data";
import { buildTestGradingWorkbook } from "@/lib/testTemplate";

function errorStatus(err) {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ValidationError) return 400;
  return 500;
}

// 강사님용 채점 시트(.xlsx)를 해당 테스트의 문항배점 설정에 맞춰
// 즉석에서 만들어 다운로드해준다.
export async function GET(_request, { params }) {
  const { id } = await params;
  try {
    const test = await getTest(id);
    const workbook = await buildTestGradingWorkbook(test);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = encodeURIComponent(`${test["테스트명"] || "채점시트"}.xlsx`);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: errorStatus(err) });
  }
}
