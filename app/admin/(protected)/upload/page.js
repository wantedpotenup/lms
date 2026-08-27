"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

function UploadBox({ title, description, templateHref, endpoint }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, error: data.error, details: data.details || [] });
      } else {
        setResult({ ok: true, savedCount: data.savedCount });
        setFile(null);
        e.target.reset();
      }
    } catch {
      setResult({ ok: false, error: "네트워크 오류가 발생했습니다.", details: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      <a href={templateHref} className="mb-4 inline-block text-xs text-indigo-600 underline underline-offset-2 dark:text-indigo-400">
        양식(CSV) 다운로드
      </a>
      <form onSubmit={handleUpload} className="space-y-3">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
        />
        <Button type="submit" disabled={!file || loading}>
          {loading ? "업로드 중..." : "업로드"}
        </Button>
      </form>

      {result && (
        <div className="mt-4">
          {result.ok ? (
            <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              {result.savedCount}건이 저장되었습니다.
            </p>
          ) : (
            <div className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <p className="mb-1 font-medium">{result.error}</p>
              {result.details.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4 text-xs">
                  {result.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function UploadPage() {
  return (
    <div>
      <h1 className="mb-2 text-xl font-bold">일괄 데이터 등록</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        구성원ID·테스트ID 존재 여부, 필수값, 점수 범위, 중복 데이터를 자동으로 검증합니다. 오류가 하나라도 있으면 저장하지
        않고 오류 내용을 아래에 보여줍니다.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UploadBox
          title="테스트 결과 일괄 등록"
          description="한 문항당 한 행으로 입력합니다. 같은 테스트ID+구성원ID의 행들이 하나의 결과로 합쳐집니다."
          templateHref="/templates/test-results-template.csv"
          endpoint="/api/admin/upload/test-results"
        />
        <UploadBox
          title="프로젝트 평가 일괄 등록"
          description="한 평가당 한 행으로 입력합니다."
          templateHref="/templates/project-evaluations-template.csv"
          endpoint="/api/admin/upload/projects"
        />
      </div>
    </div>
  );
}
