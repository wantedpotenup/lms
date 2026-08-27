import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getMemberSession } from "@/lib/auth";
import { getProjectDetailForMember, NotFoundError } from "@/lib/data";
import { PROJECT_SCORE_LABELS } from "@/lib/schema";
import { Card, ScorePill, ScoreBar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }) {
  const { evalId } = await params;
  const session = await getMemberSession();
  if (!session) redirect("/?expired=1");

  let detail;
  try {
    detail = await getProjectDetailForMember(session.memberId, evalId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

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
          <h1 className="text-xl font-bold">{detail.projectName}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            발표일 {detail.presentDate || "-"} · 강사 {detail.instructor || "-"}
          </p>
        </div>
        <ScorePill value={detail.total} max={detail.maxTotal} />
      </div>

      <Card className="mb-6">
        <ScoreBar value={detail.total} max={detail.maxTotal} colorClassName="bg-emerald-500" />
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold">평가 결과</h2>
        <div className="space-y-4">
          {detail.items.map((item) => (
            <div key={item.field}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{PROJECT_SCORE_LABELS[item.field] || item.field}</span>
                <span className="font-medium">
                  {item.score} / {item.max}
                </span>
              </div>
              <ScoreBar value={item.score} max={item.max} />
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-semibold dark:border-slate-700">
            <span>총점</span>
            <span>
              {detail.total} / {detail.maxTotal}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">강사 평가 코멘트</h2>
        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
          {detail.comment || "등록된 코멘트가 없습니다."}
        </p>
      </Card>
    </main>
  );
}
