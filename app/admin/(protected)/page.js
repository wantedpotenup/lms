import Link from "next/link";
import { listMembers, listTests, listTestResults, listProjects } from "@/lib/data";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const [members, tests, results, projects] = await Promise.all([
    listMembers(),
    listTests(),
    listTestResults(),
    listProjects(),
  ]);

  const stats = [
    { label: "구성원", value: members.length, href: "/admin/members" },
    { label: "테스트", value: tests.length, href: "/admin/tests" },
    { label: "등록된 테스트 결과", value: results.length, href: "/admin/tests" },
    { label: "프로젝트 평가", value: projects.length, href: "/admin/projects" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">관리자 대시보드</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="text-center transition hover:border-indigo-300 hover:shadow-md">
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">시작하기</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li><Link className="underline underline-offset-2" href="/admin/members">구성원 관리</Link>에서 구성원을 등록합니다.</li>
          <li><Link className="underline underline-offset-2" href="/admin/tests">테스트 관리</Link>에서 테스트를 만들고, 결과와 문항별 점수를 등록합니다.</li>
          <li><Link className="underline underline-offset-2" href="/admin/projects">프로젝트 평가</Link>에서 발표 평가 결과를 등록합니다.</li>
          <li>결과가 준비되면 <b>공개</b> 상태로 전환해야 구성원 화면에 노출됩니다.</li>
          <li>등록할 데이터가 많다면 <Link className="underline underline-offset-2" href="/admin/upload">일괄 업로드</Link>를 이용하세요.</li>
        </ol>
      </Card>
    </div>
  );
}
