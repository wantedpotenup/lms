"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Label } from "@/components/ui";

function UploadResult({ result }) {
  if (!result) return null;
  return (
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
  );
}

function TestResultUploadBox() {
  const [tests, setTests] = useState([]);
  const [testId, setTestId] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const loadTests = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tests");
      const data = await res.json();
      if (res.ok) setTests(data.tests || []);
    } catch {
      // 목록을 못 불러와도 업로드 자체는 시도할 수 있게 조용히 넘어간다.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 진입 시 테스트 목록을 불러오기 위한 의도된 호출
    loadTests();
  }, [loadTests]);

  const selectedTest = tests.find((t) => t["테스트ID"] === testId);
  const canDownloadTemplate = Boolean(selectedTest && selectedTest["문항배점"]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file || !testId) return;
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("테스트ID", testId);
      const res = await fetch("/api/admin/upload/test-results", { method: "POST", body: formData });
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
      <h2 className="mb-1 text-sm font-semibold">테스트 결과 일괄 등록</h2>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        먼저 테스트를 선택하면, 그 테스트의 문항 수·배점에 맞춰진 채점 시트(엑셀)를 내려받을 수 있어요. 강사님께서 그
        시트에 바로 채점하신 뒤 완성된 파일을 그대로 올려주시면 됩니다.
      </p>

      <div className="mb-4">
        <Label htmlFor="test-select">테스트 선택</Label>
        <select
          id="test-select"
          value={testId}
          onChange={(e) => setTestId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">테스트를 선택하세요</option>
          {tests.map((t) => (
            <option key={t["테스트ID"]} value={t["테스트ID"]}>
              {t["테스트명"]}
            </option>
          ))}
        </select>
        {testId && !canDownloadTemplate && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            이 테스트는 아직 문항별 배점이 설정되지 않았어요. 테스트 관리 화면에서 먼저 입력해주세요.
          </p>
        )}
      </div>

      {canDownloadTemplate && (
        <a
          href={`/api/admin/tests/${testId}/grading-sheet`}
          className="mb-4 inline-block text-xs text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
        >
          이 테스트용 채점 시트(엑셀) 다운로드
        </a>
      )}

      <form onSubmit={handleUpload} className="mt-2 space-y-3">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200 dark:text-slate-300 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
        />
        <Button type="submit" disabled={!file || !testId || loading}>
          {loading ? "업로드 중..." : "업로드"}
        </Button>
      </form>

      <UploadResult result={result} />
    </Card>
  );
}

function MemberUploadBox() {
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
      const res = await fetch("/api/admin/upload/members", { method: "POST", body: formData });
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
      <h2 className="mb-1 text-sm font-semibold">구성원 일괄 등록</h2>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        한 명당 한 행으로 입력합니다. 이름·생년월일이 똑같은 사람이 이미 등록되어 있으면 저장하지 않고 알려드려요.
      </p>
      <a
        href="/templates/members-template.xlsx"
        className="mb-4 inline-block text-xs text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
      >
        구성원 명단 시트(엑셀) 다운로드
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
      <UploadResult result={result} />
    </Card>
  );
}

function ProjectUploadBox() {
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
      const res = await fetch("/api/admin/upload/projects", { method: "POST", body: formData });
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
      <h2 className="mb-1 text-sm font-semibold">프로젝트 평가 일괄 등록</h2>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">한 평가당 한 행으로 입력합니다.</p>
      <a
        href="/templates/project-evaluations-template.xlsx"
        className="mb-4 inline-block text-xs text-indigo-600 underline underline-offset-2 dark:text-indigo-400"
      >
        평가 시트(엑셀) 다운로드
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
      <UploadResult result={result} />
    </Card>
  );
}

export default function UploadPage() {
  return (
    <div>
      <h1 className="mb-2 text-xl font-bold">일괄 데이터 등록</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        구성원 존재 여부, 필수값, 점수 범위, 중복 데이터를 자동으로 검증합니다. 오류가 하나라도 있으면 저장하지 않고
        오류 내용을 아래에 보여줍니다. 이름이 같은 구성원이 여러 명이면 생년월일 컬럼으로 구분해주세요.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MemberUploadBox />
        <TestResultUploadBox />
        <ProjectUploadBox />
      </div>
    </div>
  );
}
