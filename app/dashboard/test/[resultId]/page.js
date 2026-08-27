import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getMemberSession } from "@/lib/auth";
import { getTestDetailForMember, NotFoundError } from "@/lib/data";
import { Card, ScorePill, ScoreBar, Badge } from "@/components/ui";

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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-block text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← 목록으로
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{detail.testName}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            응시일 {detail.testDate || "-"}
          </p>
        </div>
        <ScorePill value={detail.score} max={detail.maxScore} />
      </div>

      <Card className="mb-6">
        <ScoreBar value={detail.score} max={detail.maxScore} />
      </Card>

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

      <Card>
        <h2 className="mb-2 text-sm font-semibold">총평</h2>
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
          {detail.summary || "등록된 총평이 없습니다."}
        </p>
      </Card>
    </main>
  );
}
