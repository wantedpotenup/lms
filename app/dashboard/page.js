import { redirect } from "next/navigation";
import Link from "next/link";
import { getMemberSession } from "@/lib/auth";
import { getMemberSummary } from "@/lib/data";
import { Card, EmptyState, ScorePill } from "@/components/ui";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getMemberSession();
  if (!session) redirect("/?expired=1");
  const { member, tests, projects } = await getMemberSummary(session.memberId);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{member.name}님, 안녕하세요</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {[member.courseName, member.cohort ? `${member.cohort}기` : null]
              .filter(Boolean)
              .join(" · ") || "소속 과정 정보 없음"}
          </p>
        </div>
        <LogoutButton endpoint="/api/auth/logout" redirectTo="/" />
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-base font-semibold">테스트 결과</h2>
        {tests.length === 0 ? (
          <EmptyState>아직 등록된 테스트 결과가 없습니다.</EmptyState>
        ) : (
          <div className="space-y-2">
            {tests.map((t) => (
              <Link key={t.resultId} href={`/dashboard/test/${t.resultId}`}>
                <Card className="flex items-center justify-between transition hover:border-indigo-300 hover:shadow-md">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.testName}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      응시일 {t.testDate || "-"}
                    </p>
                  </div>
                  <ScorePill value={t.score} max={t.maxScore} />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">프로젝트 평가</h2>
        {projects.length === 0 ? (
          <EmptyState>아직 공개된 프로젝트 평가 결과가 없습니다.</EmptyState>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <Link key={p.evalId} href={`/dashboard/project/${p.evalId}`}>
                <Card className="flex items-center justify-between transition hover:border-indigo-300 hover:shadow-md">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.projectName}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      발표일 {p.presentDate || "-"}
                    </p>
                  </div>
                  <ScorePill value={p.score} max={p.maxScore} />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
