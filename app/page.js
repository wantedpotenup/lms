"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card, Input, Label } from "@/components/ui";

function LoginNotice() {
  const params = useSearchParams();
  if (params.get("expired") !== "1") return null;
  return (
    <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
      로그인이 만료되었습니다. 다시 인증해주세요.
    </p>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, birth }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "로그인에 실패했습니다.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">학습 결과 조회</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            이름과 생년월일을 입력하면 본인의 테스트 · 프로젝트 평가 결과를
            확인할 수 있습니다.
          </p>
        </div>

        <Card>
          <Suspense fallback={null}>
            <LoginNotice />
          </Suspense>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">이름</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                required
                autoComplete="name"
              />
            </div>
            <div>
              <Label htmlFor="birth">생년월일 (예: 2000-01-01)</Label>
              <Input
                id="birth"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
                placeholder="20000101"
                inputMode="numeric"
                required
              />
            </div>
            {error && (
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "확인 중..." : "결과 확인하기"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link href="/admin/login" className="underline underline-offset-2 hover:text-slate-500">
            관리자이신가요?
          </Link>
        </p>
      </div>
    </main>
  );
}
