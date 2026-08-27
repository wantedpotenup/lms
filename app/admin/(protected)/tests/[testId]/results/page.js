"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";

function emptyQuestion(n) {
  return { 문항번호: `Q${n}`, 배점: 8, 획득점수: 8, 피드백: "" };
}

export default function TestResultsPage({ params }) {
  const { testId } = use(params);

  const [test, setTest] = useState(null);
  const [members, setMembers] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingResultId, setEditingResultId] = useState(null);
  const [memberId, setMemberId] = useState("");
  const [summary, setSummary] = useState("");
  const [questions, setQuestions] = useState([emptyQuestion(1)]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [testsRes, membersRes, resultsRes] = await Promise.all([
        fetch("/api/admin/tests"),
        fetch("/api/admin/members"),
        fetch(`/api/admin/test-results?testId=${encodeURIComponent(testId)}`),
      ]);
      const testsData = await testsRes.json();
      const membersData = await membersRes.json();
      const resultsData = await resultsRes.json();
      setTest((testsData.tests || []).find((t) => t["테스트ID"] === testId) || null);
      setMembers(membersData.members || []);
      setResults(resultsData.results || []);
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 진입 시 목록을 불러오기 위한 의도된 호출
    load();
  }, [load]);

  function openCreate() {
    setEditingResultId(null);
    setMemberId("");
    setSummary("");
    setQuestions([emptyQuestion(1)]);
    setError("");
    setShowForm(true);
  }

  async function openEdit(resultId) {
    const res = await fetch(`/api/admin/test-results?resultId=${encodeURIComponent(resultId)}`);
    const data = await res.json();
    if (!res.ok) return;
    setEditingResultId(resultId);
    setMemberId(data.result["구성원ID"]);
    setSummary(data.result["총평"] || "");
    setQuestions(
      data.questions.length > 0
        ? data.questions.map((q) => ({
            문항번호: q["문항번호"],
            배점: q["배점"],
            획득점수: q["획득점수"],
            피드백: q["피드백"] || "",
          }))
        : [emptyQuestion(1)]
    );
    setError("");
    setShowForm(true);
  }

  function updateQuestion(idx, field, value) {
    setQuestions((qs) => qs.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, emptyQuestion(qs.length + 1)]);
  }

  function removeQuestion(idx) {
    setQuestions((qs) => (qs.length > 1 ? qs.filter((_, i) => i !== idx) : qs));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { 테스트ID: testId, 구성원ID: memberId, 총평: summary, questions };
      const res = await fetch(
        editingResultId ? `/api/admin/test-results/${editingResultId}` : "/api/admin/test-results",
        {
          method: editingResultId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "저장에 실패했습니다.");
        return;
      }
      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(resultId) {
    if (!confirm("이 결과를 삭제할까요?")) return;
    const res = await fetch(`/api/admin/test-results/${resultId}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  return (
    <div>
      <Link href="/admin/tests" className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
        ← 테스트 목록으로
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{test ? test["테스트명"] : "테스트"} 결과 관리</h1>
        <Button onClick={openCreate}>+ 결과 추가</Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">{editingResultId ? "결과 수정" : "결과 추가"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>구성원</Label>
                <Select
                  required
                  disabled={!!editingResultId}
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                >
                  <option value="">선택해주세요</option>
                  {members.map((m) => (
                    <option key={m["구성원ID"]} value={m["구성원ID"]}>
                      {m["이름"]} ({m["구성원ID"]})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <Label>문항별 결과</Label>
              <div className="space-y-2 overflow-x-auto">
                {questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="grid min-w-[560px] grid-cols-12 gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-700"
                  >
                    <input
                      className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                      value={q["문항번호"]}
                      onChange={(e) => updateQuestion(idx, "문항번호", e.target.value)}
                      placeholder="Q1"
                    />
                    <input
                      className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                      type="number"
                      value={q["배점"]}
                      onChange={(e) => updateQuestion(idx, "배점", e.target.value)}
                      placeholder="배점"
                    />
                    <input
                      className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                      type="number"
                      value={q["획득점수"]}
                      onChange={(e) => updateQuestion(idx, "획득점수", e.target.value)}
                      placeholder="획득점수"
                    />
                    <input
                      className="col-span-5 rounded-lg border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
                      value={q["피드백"]}
                      onChange={(e) => updateQuestion(idx, "피드백", e.target.value)}
                      placeholder="피드백 (감점 문항에 작성)"
                    />
                    <button
                      type="button"
                      onClick={() => removeQuestion(idx)}
                      className="col-span-1 rounded-lg text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="secondary" className="mt-2 px-3 py-1.5 text-xs" onClick={addQuestion}>
                + 문항 추가
              </Button>
            </div>

            <div>
              <Label>총평</Label>
              <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>

            {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                취소
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">불러오는 중...</p>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">등록된 결과가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2 pr-2 font-medium">구성원</th>
                  <th className="py-2 pr-2 font-medium">총점</th>
                  <th className="py-2 pr-2 font-medium">등록일</th>
                  <th className="py-2 font-medium text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r["결과ID"]} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-2 pr-2 font-medium">{r["구성원이름"]}</td>
                    <td className="py-2 pr-2">
                      {r["총점"]} / {test?.["만점"] ?? "-"}
                    </td>
                    <td className="py-2 pr-2 text-slate-500 dark:text-slate-400">{r["등록일"]}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => openEdit(r["결과ID"])}>
                        수정
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400"
                        onClick={() => handleDelete(r["결과ID"])}
                      >
                        삭제
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
