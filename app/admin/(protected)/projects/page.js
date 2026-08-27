"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { PROJECT_SCORE_FIELDS, PROJECT_SCORE_LABELS } from "@/lib/schema";

const emptyForm = {
  평가ID: "",
  구성원ID: "",
  프로젝트명: "",
  발표일: "",
  강사명: "",
  기술활용도: 3,
  기능구현완성도: 3,
  문제해결: 3,
  발표전달력: 3,
  평가코멘트: "",
  공개여부: "비공개",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
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
      const [pRes, mRes] = await Promise.all([fetch("/api/admin/projects"), fetch("/api/admin/members")]);
      const pData = await pRes.json();
      const mData = await mRes.json();
      if (!pRes.ok || !mRes.ok) {
        setLoadError(pData.error || mData.error || "목록을 불러오지 못했습니다.");
        setProjects([]);
        setMembers([]);
        return;
      }
      setLoadError("");
      setProjects(pData.projects || []);
      setMembers(mData.members || []);
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

  function openEdit(p) {
    setForm({
      평가ID: p["평가ID"],
      구성원ID: p["구성원ID"],
      프로젝트명: p["프로젝트명"],
      발표일: p["발표일"],
      강사명: p["강사명"],
      기술활용도: p["기술활용도"],
      기능구현완성도: p["기능구현완성도"],
      문제해결: p["문제해결"],
      발표전달력: p["발표전달력"],
      평가코멘트: p["평가코멘트"],
      공개여부: p["공개여부"] || "비공개",
    });
    setEditingId(p["평가ID"]);
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editingId ? `/api/admin/projects/${editingId}` : "/api/admin/projects", {
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
    if (!confirm("이 프로젝트 평가를 삭제할까요?")) return;
    const res = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function togglePublish(p) {
    const next = p["공개여부"] === "공개" ? "비공개" : "공개";
    const res = await fetch(`/api/admin/projects/${p["평가ID"]}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 공개여부: next }),
    });
    if (res.ok) await load();
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">프로젝트 평가 관리</h1>
        <Button onClick={openCreate}>+ 평가 추가</Button>
      </div>

      {loadError && (
        <p className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          {loadError}
        </p>
      )}

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">{editingId ? "평가 수정" : "평가 추가"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>구성원</Label>
                <Select
                  required
                  disabled={!!editingId}
                  value={form["구성원ID"]}
                  onChange={(e) => setForm({ ...form, 구성원ID: e.target.value })}
                >
                  <option value="">선택해주세요</option>
                  {members.map((m) => (
                    <option key={m["구성원ID"]} value={m["구성원ID"]}>
                      {m["이름"]} ({m["구성원ID"]})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>프로젝트명</Label>
                <Input required value={form["프로젝트명"]} onChange={(e) => setForm({ ...form, 프로젝트명: e.target.value })} />
              </div>
              <div>
                <Label>발표일</Label>
                <Input value={form["발표일"]} onChange={(e) => setForm({ ...form, 발표일: e.target.value })} />
              </div>
              <div>
                <Label>강사명</Label>
                <Input value={form["강사명"]} onChange={(e) => setForm({ ...form, 강사명: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {PROJECT_SCORE_FIELDS.map((field) => (
                <div key={field}>
                  <Label>{PROJECT_SCORE_LABELS[field]} (0~5)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    required
                    value={form[field]}
                    onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  />
                </div>
              ))}
            </div>

            <div>
              <Label>강사 평가 코멘트</Label>
              <Textarea rows={3} value={form["평가코멘트"]} onChange={(e) => setForm({ ...form, 평가코멘트: e.target.value })} />
            </div>

            <div>
              <Label>공개여부</Label>
              <Select value={form["공개여부"]} onChange={(e) => setForm({ ...form, 공개여부: e.target.value })} className="max-w-[160px]">
                <option value="비공개">비공개</option>
                <option value="공개">공개</option>
              </Select>
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
        ) : projects.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">등록된 프로젝트 평가가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <div
                key={p["평가ID"]}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {p["구성원이름"]} · {p["프로젝트명"]}
                    </p>
                    <Badge tone={p["공개여부"] === "공개" ? "green" : "slate"}>{p["공개여부"] === "공개" ? "공개" : "비공개"}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {p["발표일"]} · 총점 {p["총점"]} / 20
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={() => togglePublish(p)}>
                    {p["공개여부"] === "공개" ? "비공개로 전환" : "공개로 전환"}
                  </Button>
                  <Button variant="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => openEdit(p)}>
                    수정
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400"
                    onClick={() => handleDelete(p["평가ID"])}
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
