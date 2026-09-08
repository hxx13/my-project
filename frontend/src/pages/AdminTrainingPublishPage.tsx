import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { ChevronLeft, Plus, Search, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { createTraining, addOccurrence } from "@/api/domains/training.api";
import { fetchExamPapers } from "@/features/exam/api/examPaper.api";
import { fetchUnifiedPersonnel } from "@/api/domains/admin.api";

interface OccurrenceRow {
  startTime: string;
  endTime: string;
  address: string;
  examinerName: string;
  examinerNumber: string;
}

const emptyOccurrence = (): OccurrenceRow => ({
  startTime: "",
  endTime: "",
  address: "",
  examinerName: "",
  examinerNumber: "",
});

/** 所属人：按姓名搜索统一人员库，选中即回填 id */
function OwnerPicker({
  ownerId,
  ownerName,
  onSelect,
}: {
  ownerId: string;
  ownerName: string;
  onSelect: (id: string, name: string) => void;
}) {
  const [kw, setKw] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<{ id: string; name: string; jobNumber: string }[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!kw.trim()) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchUnifiedPersonnel(1, 20, { keyword: kw.trim() });
        if (!cancelled)
          setOptions(
            (res.list ?? []).map((r) => ({ id: r.staffId ?? "", name: r.name, jobNumber: r.jobNumber ?? "" })),
          );
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [kw]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(adminInputClass, "flex items-center justify-between text-left")}
      >
        <span className={ownerName ? "text-neutral-900" : "text-neutral-400"}>
          {ownerName || "搜索选择所属人…"}
        </span>
        <Search className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-neutral-200 bg-white shadow-lg">
          <input
            autoFocus
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="搜索姓名"
            className="w-full border-b border-neutral-100 px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-56 overflow-auto">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />搜索中…
              </div>
            )}
            {!loading && kw.trim() && options.length === 0 && (
              <div className="px-3 py-2 text-xs text-neutral-400">无结果</div>
            )}
            {!loading &&
              options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    onSelect(o.id, o.name);
                    setOpen(false);
                    setKw("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  <span>{o.name}</span>
                  <span className="font-mono text-xs text-neutral-400">{o.jobNumber}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminTrainingPublishPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [type, setType] = useState(1);
  const [timeLimit, setTimeLimit] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [paperId, setPaperId] = useState("");
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([emptyOccurrence()]);
  const [saving, setSaving] = useState(false);

  const { data: paperData } = useQuery({
    queryKey: ["exam-papers", "published"],
    queryFn: async () => fetchExamPapers({ page: 1, pageSize: 200 }),
  });
  const papers = useMemo(
    () => (paperData?.list ?? []).filter((p) => p.status === "PUBLISHED"),
    [paperData],
  );

  const patchOccurrence = (i: number, patch: Partial<OccurrenceRow>) =>
    setOccurrences((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("请填写培训名称");
      return;
    }
    setSaving(true);
    try {
      const created = await createTraining({
        code: `training-${Date.now()}`,
        name: name.trim(),
        type,
        paperId: paperId ? Number(paperId) : undefined,
        ownerId: ownerId || undefined,
        timeLimit: timeLimit ? Number(timeLimit) : undefined,
        recurrence: recurrence.trim() || undefined,
      });
      const rows = occurrences.filter(
        (o) => o.startTime || o.endTime || o.address || o.examinerName || o.examinerNumber,
      );
      for (const o of rows) {
        await addOccurrence(created.id, {
          startTime: o.startTime || undefined,
          endTime: o.endTime || undefined,
          address: o.address || undefined,
          examinerName: o.examinerName || undefined,
          examinerNumber: o.examinerNumber || undefined,
        });
      }
      toast.success("已发布");
      navigate("/console/admin/aro-binding");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const back = () => navigate("/console/admin/aro-binding");

  return (
    <AdminPageShell>
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] flex-col">
        <AdminFormCard className="mb-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <AdminButton type="button" tone="secondary" size="default" onClick={back}>
                <ChevronLeft className="mr-1 h-4 w-4" />返回
              </AdminButton>
              <h2 className="text-base font-bold text-[var(--app-color-text-primary)]">发布培训</h2>
            </div>
            <div className="flex items-center gap-2">
              <AdminButton type="button" tone="secondary" size="default" onClick={back}>
                取消
              </AdminButton>
              <AdminButton type="button" tone="primary" size="default" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}保存
              </AdminButton>
            </div>
          </div>
        </AdminFormCard>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          <AdminFormCard title="基本信息">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={adminLabelClass}>名称</label>
                <input
                  className={adminInputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="培训名称"
                />
              </div>
              <div className="space-y-1.5">
                <label className={adminLabelClass}>类型</label>
                <select
                  className={adminInputClass}
                  value={type}
                  onChange={(e) => setType(Number(e.target.value))}
                >
                  <option value={1}>准入培训</option>
                  <option value={2}>手术培训</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={adminLabelClass}>时间限制（分钟）</label>
                <input
                  className={adminInputClass}
                  type="number"
                  min={0}
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  placeholder="如 60"
                />
              </div>
              <div className="space-y-1.5">
                <label className={adminLabelClass}>周期规则</label>
                <input
                  className={adminInputClass}
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value)}
                  placeholder="如 每周"
                />
              </div>
              <div className="space-y-1.5">
                <label className={adminLabelClass}>所属人</label>
                <OwnerPicker ownerId={ownerId} ownerName={ownerName} onSelect={(id, n) => { setOwnerId(id); setOwnerName(n); }} />
              </div>
              <div className="space-y-1.5">
                <label className={adminLabelClass}>试卷（可选）</label>
                <select
                  className={adminInputClass}
                  value={paperId}
                  onChange={(e) => setPaperId(e.target.value)}
                >
                  <option value="">不绑定试卷</option>
                  {papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </AdminFormCard>

          <AdminFormCard
            title="场次"
            actions={
              <AdminButton
                type="button"
                tone="secondary"
                size="sm"
                onClick={() => setOccurrences((prev) => [...prev, emptyOccurrence()])}
              >
                <Plus className="mr-1 h-4 w-4" />添加场次
              </AdminButton>
            }
          >
            <div className="space-y-3">
              {occurrences.map((o, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-500">场次 {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => setOccurrences((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-neutral-400 transition-colors hover:text-rose-500"
                      aria-label="删除场次"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className={adminLabelClass}>开始时间</label>
                      <input
                        className={adminInputClass}
                        type="datetime-local"
                        value={o.startTime}
                        onChange={(e) => patchOccurrence(i, { startTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={adminLabelClass}>结束时间</label>
                      <input
                        className={adminInputClass}
                        type="datetime-local"
                        value={o.endTime}
                        onChange={(e) => patchOccurrence(i, { endTime: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={adminLabelClass}>地点</label>
                      <input
                        className={adminInputClass}
                        value={o.address}
                        onChange={(e) => patchOccurrence(i, { address: e.target.value })}
                        placeholder="地点"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={adminLabelClass}>考官</label>
                      <input
                        className={adminInputClass}
                        value={o.examinerName}
                        onChange={(e) => patchOccurrence(i, { examinerName: e.target.value })}
                        placeholder="考官姓名"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className={adminLabelClass}>考官编号</label>
                      <input
                        className={adminInputClass}
                        value={o.examinerNumber}
                        onChange={(e) => patchOccurrence(i, { examinerNumber: e.target.value })}
                        placeholder="考官编号"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </AdminFormCard>
        </div>
      </div>
    </AdminPageShell>
  );
}
