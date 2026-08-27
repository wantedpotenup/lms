"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Label, Select } from "@/components/ui";

const STATUS_OPTIONS = ["재학", "수료", "중도이탈"];

const emptyForm = { 구성원ID: "", 이름: "", 생년월일: "", 과정명: "", 기수: "", 상태: "재학" };

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async (kw = "") => {
    setLoading(true);
    try {
      const qs = kw ? `?keyword=${encodeURIComponent(kw)}` : "";
      const res = await fetch(`/api/admin/members${qs}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "목록을 불러오지 못했습니다.");
        setMembers([]);
        return;
      }
      setLoadError("");
      setMembers(data.members || []);
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

  function openEdit(m) {
    setForm({
      구성원ID: m["구성원ID"],
      이름: m["이름"],
      생년월일: m["생년월일"],
      과정명: m["과정명"],
      기수: m["기수"],
      상태: m["상태"] || "재학",
    });
    setEditingId(m["구성원ID"]);
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editingId ? `/api/admin/members/${editingId}` : "/api/admin/members",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "저장에 실패했습니다.");
        return;
      }
      setShowForm(false);
      await load(keyword);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("이 구성원을 삭제할까요? 연결된 테스트/프로젝트 결과는 함께 삭제되지 않으니 주의해주세요.")) return;
    const res = await fetch(`/api/admin/members/${id}`, { method: "DELETE" });
    if (res.ok) await load(keyword);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">구성원 관리</h1>
        <Button onClick={openCreate}>+ 구성원 추가</Button>
      </div>

      {loadError && (
        <p className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          {loadError}
        </p>
      )}

      <div className="mb-4 flex gap-2">
        <Input
          placeholder="이름 또는 구성원ID로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(keyword)}
          className="max-w-xs"
        />
        <Button variant="secondary" onClick={() => load(keyword)}>
          검색
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold">
            {editingId ? "구성원 수정" : "구성원 추가"}
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>이름</Label>
              <Input required value={form["이름"]} onChange={(e) => setForm({ ...form, 이름: e.target.value })} />
            </div>
            <div>
              <Label>생년월일 (예: 2000-01-01)</Label>
              <Input required value={form["생년월일"]} onChange={(e) => setForm({ ...form, 생년월일: e.target.value })} />
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
              <Label>상태</Label>
              <Select value={form["상태"]} onChange={(e) => setForm({ ...form, 상태: e.target.value })}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
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
        ) : members.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">등록된 구성원이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="py-2 pr-2 font-medium">이름</th>
                  <th className="py-2 pr-2 font-medium">생년월일</th>
                  <th className="py-2 pr-2 font-medium">과정명</th>
                  <th className="py-2 pr-2 font-medium">기수</th>
                  <th className="py-2 pr-2 font-medium">상태</th>
                  <th className="py-2 pr-2 font-medium">구성원ID</th>
                  <th className="py-2 font-medium text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m["구성원ID"]} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="py-2 pr-2 font-medium">{m["이름"]}</td>
                    <td className="py-2 pr-2 text-slate-500 dark:text-slate-400">{m["생년월일"]}</td>
                    <td className="py-2 pr-2">{m["과정명"]}</td>
                    <td className="py-2 pr-2">{m["기수"]}</td>
                    <td className="py-2 pr-2">{m["상태"]}</td>
                    <td className="py-2 pr-2 text-xs text-slate-400">{m["구성원ID"]}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => openEdit(m)}>
                        수정
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400"
                        onClick={() => handleDelete(m["구성원ID"])}
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
