"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Input, Label } from "@/components/ui";

const emptyForm = {
  테스트ID: "",
  테스트명: "",
  과정명: "",
  기수: "",
  응시일: "",
  만점: 100,
  공개여부: "비공개",
  문항배점: "",
  채점기준: "",
};

export default function TestsPage() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tests");
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "목록을 불러오지 못했습니다.");
        setTests([]);
        return;
      }
      setLoadError("");
      setTests(data.tests || []);
    } catch {
      setLoadError("네트워크 오류로 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 진입 시 목록을 불러오기 위한 의도된 호출
    load();
  }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(t) {
    setForm({
      테스트ID: t["테스트ID"],
      테스트명: t["테스트명"],
      과정명: t["과정명"],
      기수: t["기수"],
      응시일: t["응시일"],
      만점: t["만점"],
      공개여부: t["공개여부"] || "비공개",
      문항배점: t["문항배점"] || "",
      채점기준: t["채점기준"] || "",
    });
    setEditingId(t["테스트ID"]);
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editingId ? `/api/admin/tests/${editingId}` : "/api/admin/tests", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
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

  async function handleDelete(id) {
    if (!confirm("이 테스트를 삭제할까요? 등록된 결과는 관리자 화면에서 별도로 확인해주세요.")) return;
    const res = await fetch(`/api/admin/tests/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function togglePublish(t) {
    const next = t["공개여부"] === "공개" ? "비공개" : "공개";
    const res = await fetch(`/api/admin/tests/${t["테스트ID"]}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 공개여부: next }),
    });
    if (res.ok) await load();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">테스트 관리</h1>
        <Button onClick={openCreate}>+ 테스트 추가</Button>
      </div>

      {loadError && (
        <p className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          {loadError}
        </p>
      )}

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">{editingId ? "테스트 수정" : "테스트 추가"}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>테스트명</Label>
              <Input required value={form["테스트명"]} onChange={(e) => setForm({ ...form, 테스트명: e.target.value })} />
            </div>
            <div>
              <Label>만점</Label>
              <Input required type="number" value={form["만점"]} onChange={(e) => setForm({ ...form, 만점: e.target.value })} />
            </div>
            <div>
              <Label>과정명</Label>
              <Input value={form["과정명"]} onChange={(e) => setForm({ ...form, 과정명: e.target.value })} />
            </div>
            <div>
              <Label>기수</Label>
              <Input value={form["기수"]} onChange={(e) => setForm({ ...form, 기수: e.target.value })} />
            </div>
            <div>
              <Label>응시일 (예: 2026-08-10)</Label>
              <Input value={form["응시일"]} onChange={(e) => setForm({ ...form, 응시일: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>문항별 배점 (쉼표로 구분, 예: 8,8,8,5,8,12,8,12,8,5,8,10)</Label>
              <Input
                value={form["문항배점"]}
                onChange={(e) => setForm({ ...form, 문항배점: e.target.value })}
                placeholder="8,8,8,5,8,12,8,12,8,5,8,10"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                입력해두면 강사님께 드릴 채점 시트(문항 수·배점이 자동으로 반영된 엑셀 파일)를 바로 만들어드릴 수
                있어요. 나중에 채점 결과를 업로드할 때도 이 배점을 기준으로 검증합니다.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label>채점 기준 (선택, 강사님용 채점 시트 안내문에 표시됩니다)</Label>
              <Input
                value={form["채점기준"]}
                onChange={(e) => setForm({ ...form, 채점기준: e.target.value })}
                placeholder="핵심 개념과 정답 방향이 명확한 경우 경미한 표현 차이는 인정합니다."
              />
            </div>
            {error && <p className="sm:col-span-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
            <div className="flex gap-2 sm:col-span-2">
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
        ) : tests.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">등록된 테스트가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {tests.map((t) => (
              <div
                key={t["테스트ID"]}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{t["테스트명"]}</p>
                    <Badge tone={t["공개여부"] === "공개" ? "green" : "slate"}>{t["공개여부"] === "공개" ? "공개" : "비공개"}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {[t["과정명"], t["기수"] ? `${t["기수"]}기` : null, t["응시일"], `만점 ${t["만점"]}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Link href={`/admin/tests/${t["테스트ID"]}/results`}>
                    <Button variant="secondary" className="px-2.5 py-1.5 text-xs">
                      결과 관리
                    </Button>
                  </Link>
                  {t["문항배점"] && (
                    <a href={`/api/admin/tests/${t["테스트ID"]}/grading-sheet`}>
                      <Button variant="secondary" className="px-2.5 py-1.5 text-xs">
                        채점 시트 다운로드
                      </Button>
                    </a>
                  )}
                  <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => togglePublish(t)}>
                    {t["공개여부"] === "공개" ? "비공개로 전환" : "공개로 전환"}
                  </Button>
                  <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => openEdit(t)}>
                    수정
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400"
                    onClick={() => handleDelete(t["테스트ID"])}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
