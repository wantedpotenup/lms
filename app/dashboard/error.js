"use client";

import { Card, Button } from "@/components/ui";

export default function DashboardError({ reset }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full text-center">
        <h1 className="mb-2 text-lg font-bold">일시적인 오류가 발생했습니다</h1>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          결과를 불러오는 중 문제가 생겼어요. 잠시 후 다시 시도하거나, 계속되면 관리자에게 알려주세요.
        </p>
        <Button onClick={() => reset()}>다시 시도</Button>
      </Card>
    </main>
  );
}
