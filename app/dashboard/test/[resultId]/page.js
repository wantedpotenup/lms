import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getMemberSession } from "@/lib/auth";
import { getTestDetailForMember, NotFoundError } from "@/lib/data";
import { Card, ScoreRing, ScoreBar, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TestDetailPage({ params }) {
  const { resultId } = await params;
  const session = await getMemberSession();
  if (!session) redirect("/?expired=1");

  let detail;
  try {
    detail = await getTestDetailForMember(session.memberId, resultId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const feedbackQuestions = detail.questions.filter((q) => q.deducted && q.feedback);

  const hasAverage = detail.average !== null && detail.average !== undefined;
  // 오른쪽 목록: 내 위치(상위 N%)는 항상, 최고점/최저점은 관리자가 켜둔 테스트만.
  const sideRows = [];
  if (detail.position) sideRows.push({ label: "내 위치", value: detail.position, dot: "bg-indigo-500" });
  if (detail.highest !== null && detail.highest !== undefined) {
    sideRows.push({ label: "최고점", value: `${detail.highest} / ${detail.maxScore}`, dot: "bg-emerald-500" });
  }
  if (detail.lowest !== null && detail.lowest !== undefined) {
    sideRows.push({ label: "최저점", value: `${detail.lowest} / ${detail.maxScore}`, dot: "bg-indigo-300" });
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← 목록으로
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold">{detail.testName}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">응시일 {detail.testDate || "-"}</p>
      </div>

      <Card className="mb-6">
        <div
          className={`grid items-center gap-6 ${
            sideRows.length > 0 ? "sm:grid-cols-[auto_1fr_minmax(0,14rem)]" : "sm:grid-cols-[auto_1fr]"
          }`}
        >
          <div className="flex justify-center">
            <ScoreRing value={detail.score} max={detail.maxScore} />
          </div>

          <div>
            {hasAverage ? (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  전체 평균{detail.respondents > 0 ? ` (응시 ${detail.respondents}명)` : ""}
                </p>
                <p className="mt-1 text-3xl font-bold">
                  {detail.average}
                  <span className="ml-1.5 text-lg font-medium text-slate-500 dark:text-slate-400">
                    / {detail.maxScore}
                  </span>
                </p>
                <div className="mt-3">
                  <ScoreBar value={detail.average} max={detail.maxScore} />
                </div>
              </>
            ) : (
              <ScoreBar value={detail.score} max={detail.maxScore} />
            )}
          </div>

          {sideRows.length > 0 && (
            <ul className="divide-y divide-slate-100 border-t border-slate-200 pt-1 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 dark:divide-slate-800 dark:border-slate-700">
              {sideRows.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <span className={`h-2.5 w-2.5 rounded-full ${row.dot}`} />
                    {row.label}
                  </span>
                  <span className="font-semibold">{row.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {!detail.totalOnly && detail.questions.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">문항별 결과</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2 pr-2 font-medium">문항</th>
                  <th className="py-2 pr-2 font-medium">획득점수</th>
                  <th className="py-2 pr-2 font-medium">배점</th>
                  <th className="py-2 font-medium">감점여부</th>
                </tr>
              </thead>
              <tbody>
                {detail.questions.map((q) => (
                  <tr
                    key={q.questionNumber}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                  >
                    <td className="py-2 pr-2 font-medium">{q.questionNumber}</td>
                    <td className="py-2 pr-2">{q.earned}</td>
                    <td className="py-2 pr-2 text-slate-500 dark:text-slate-400">{q.max}</td>
                    <td className="py-2">
                      {q.deducted ? <Badge tone="red">감점</Badge> : <Badge tone="green">정상</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {feedbackQuestions.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">문항별 피드백</h2>
          <ul className="space-y-3">
            {feedbackQuestions.map((q) => (
              <li key={q.questionNumber}>
                <p className="mb-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {q.questionNumber}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{q.feedback}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {detail.combinedFeedback && (
        <Card className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">{detail.totalOnly ? "피드백" : "문항별 피드백"}</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
            {detail.combinedFeedback}
          </p>
        </Card>
      )}

      {String(detail.summary ?? "").trim() !== "" && (
        <Card className="flex items-center gap-5 bg-emerald-50/40 dark:bg-emerald-500/5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12.5 2.5 2.5 4.5-5" />
            </svg>
          </div>
          <div className="min-w-0 self-stretch border-l border-slate-200 pl-5 dark:border-slate-700">
            <h2 className="text-sm font-semibold">총평</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">
              {detail.summary}
            </p>
          </div>
        </Card>
      )}
    </main>
  );
}
