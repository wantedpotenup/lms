"use client";

import { Card, Button } from "@/components/ui";

export default function AdminError({ error, reset }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <h1 className="mb-2 text-lg font-bold text-rose-600 dark:text-rose-400">
          데이터를 불러오지 못했습니다
        </h1>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
          대부분 구글 시트 연동 설정(환경변수, 시트 공유, 탭 이름) 문제입니다. 아래 내용을 확인해주세요.
        </p>
        <ul className="mb-4 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Vercel의 환경변수 5개(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID, SESSION_SECRET, ADMIN_PASSWORD)가 정확히 입력되어 있는지</li>
          <li>구글 시트가 서비스 계정 이메일과 <b>편집자</b>로 공유되어 있는지</li>
          <li>시트 탭 이름이 &quot;구성원&quot;, &quot;테스트&quot;, &quot;테스트결과&quot;, &quot;테스트문항결과&quot;, &quot;프로젝트평가&quot;와 정확히 일치하는지</li>
          <li>환경변수를 새로 입력했다면 Vercel에서 Redeploy 했는지</li>
        </ul>
        {error?.message && (
          <div className="mb-4 rounded-xl bg-rose-50 px-3.5 py-3 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
            <p className="mb-1 font-semibold">서버가 알려준 오류 메시지</p>
            <p className="whitespace-pre-wrap break-words font-mono">{error.message}</p>
          </div>
        )}
        <Button onClick={() => reset()}>다시 시도</Button>
      </Card>
    </div>
  );
}
