import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getMemberSession } from "@/lib/auth";
import { getTestDetailForMember, NotFoundError } from "@/lib/data";
import { Card, ScoreBar, Badge } from "@/components/ui";

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
  // 오른쪽 "평균 및 분포": 평균은 항상, 최저/최고점은 관리자가 켜둔 테스트만.
  const statRows = [];
  if (hasAverage) statRows.push({ label: "평균 점수", value: detail.average });
  if (detail.lowest !== null && detail.lowest !== undefined) statRows.push({ label: "최저 점수", value: detail.lowest });
  if (detail.highest !== null && detail.highest !== undefined) statRows.push({ label: "최고 점수", value: detail.highest });

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

      <div className={`mb-6 grid gap-4 ${statRows.length > 0 ? "sm:grid-cols-2" : ""}`}>
        <Card>
          <h2 className="text-sm font-semibold">내 점수</h2>
          <p className="mt-3 text-4xl font-bold">
            {detail.score}
            <span className="ml-2 text-xl font-medium text-slate-500 dark:text-slate-400">/ {detail.maxScore}</span>
          </p>
          <div className="mt-4">
            <ScoreBar value={detail.score} max={detail.maxScore} />
          </div>
          {detail.position && (
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
              {detail.position}
            </span>
          )}
        </Card>

        {statRows.length > 0 && (
          <Card>
            <h2 className="text-sm font-semibold">
              평균 및 분포
              {detail.respondents > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                  응시 {detail.respondents}명
                </span>
              )}
            </h2>
            <ul className="mt-3 space-y-2">
              {statRows.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60"
                >
                  <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
                  <span className="font-semibold">{row.value}점</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

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
