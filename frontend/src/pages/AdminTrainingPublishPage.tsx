import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { ChevronLeft, Plus, Search, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import {
  createTraining,
  updateTraining,
  fetchTraining,
  addOccurrence,
  updateOccurrence,
  deleteOccurrence,
  fetchTrainingLocations,
  addTrainingLocation,
} from "@/api/domains/training.api";
import { fetchExamPapers, fetchExamFolders } from "@/features/exam/api/examPaper.api";
import type { ExamPaperSummary, ExamPaperFolder } from "@/features/exam/api/examPaper.api";
import { fetchUnifiedPersonnel } from "@/api/domains/admin.api";
import { appPrompt } from "@/lib/appDialog";

interface OccurrenceRow {
  id?: number;
  startTime: string;
  endTime: string;
  address: string;
  examinerName: string;
  /** 用户选择「自定义地点」，地址走自由文本 */
  customAddress?: boolean;
}

const emptyOccurrence = (): OccurrenceRow => ({
  startTime: "",
  endTime: "",
  address: "",
  examinerName: "",
});

/** "yyyy-MM-dd HH:mm:ss"（后端墙钟）→ datetime-local 的 "yyyy-MM-ddTHH:mm" */
const toDatetimeLocal = (s?: string | null) => (s ? s.replace(" ", "T").slice(0, 16) : "");

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

/** 试卷多选绑定：按文件夹分组、可折叠、支持按标题/编码搜索 */
function PaperPicker({
  papers,
  folders,
  selected,
  onToggle,
}: {
  papers: ExamPaperSummary[];
  folders: ExamPaperFolder[];
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [search, setSearch] = useState("");

  const folderName = (folderId?: number | null) =>
    folderId == null ? "未分类" : folders.find((f) => f.id === folderId)?.name ?? "未分类";

  const q = search.trim().toLowerCase();
  const filtered = q
    ? papers.filter(
        (p) =>
          (p.title ?? "").toLowerCase().includes(q) ||
          (p.code ?? "").toLowerCase().includes(q),
      )
    : papers;

  const groups: { name: string; items: ExamPaperSummary[] }[] = [];
  const byFolder = new Map<string, ExamPaperSummary[]>();
  for (const p of filtered) {
    const key = folderName(p.folderId);
    const arr = byFolder.get(key);
    if (arr) arr.push(p);
    else byFolder.set(key, [p]);
  }
  for (const [name, items] of byFolder) groups.push({ name, items });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索试卷标题 / 编码"
          className={cn(adminInputClass, "pl-8")}
        />
      </div>
      <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-neutral-200 p-2">
        {groups.length === 0 && (
          <div className="px-2 py-3 text-center text-xs text-neutral-400">无匹配试卷</div>
        )}
        {groups.map((g) => (
          <details key={g.name} className="rounded-md border border-neutral-100" open>
            <summary className="cursor-pointer select-none px-2 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-50">
              {g.name}
              <span className="ml-1 font-normal text-neutral-400">({g.items.length})</span>
            </summary>
            <div className="space-y-0.5 border-t border-neutral-100 p-1">
              {g.items.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={() => onToggle(p.id)}
                    className="h-3.5 w-3.5 accent-[var(--app-color-primary)]"
                  />
                  <span className="truncate">{p.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-neutral-400">{p.code}</span>
                </label>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export default function AdminTrainingPublishPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const editing = editingId != null;

  const [name, setName] = useState("");
  const [type, setType] = useState(1);
  const [timeLimit, setTimeLimit] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [recurrenceTime, setRecurrenceTime] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [paperIds, setPaperIds] = useState<number[]>([]);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([emptyOccurrence()]);
  const [saving, setSaving] = useState(false);

  const { data: paperData } = useQuery({
    queryKey: ["exam-papers", "published"],
    queryFn: async () => fetchExamPapers({ page: 1, pageSize: 500 }),
  });
  const papers = useMemo(
    () => (paperData?.list ?? []).filter((p) => p.status === "PUBLISHED"),
    [paperData],
  );

  const { data: locations = [], refetch: refetchLocations } = useQuery({
    queryKey: ["training-locations"],
    queryFn: fetchTrainingLocations,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["exam-folders"],
    queryFn: fetchExamFolders,
  });

  const { data: editDetail } = useQuery({
    queryKey: ["training", editingId],
    queryFn: () => fetchTraining(editingId!),
    enabled: editing,
  });

  useEffect(() => {
    if (!editing || !editDetail) return;
    setName(editDetail.name ?? "");
    setType(editDetail.type ?? 1);
    setTimeLimit(editDetail.timeLimit != null ? String(editDetail.timeLimit) : "");
    setRecurrence(editDetail.recurrence ?? "");
    setRecurrenceDay(editDetail.recurrenceDay ?? 1);
    setRecurrenceTime(editDetail.recurrenceTime ?? "");
    setOwnerId(editDetail.ownerId ?? "");
    setOwnerName(editDetail.ownerId ?? "");
    setPaperIds(editDetail.paperIds ?? []);
    const occs = (editDetail.occurrences ?? []).map((o) => ({
      id: o.id,
      startTime: toDatetimeLocal(o.startTime),
      endTime: toDatetimeLocal(o.endTime),
      address: o.address ?? "",
      examinerName: o.examinerName ?? "",
    }));
    setOccurrences(occs.length ? occs : [emptyOccurrence()]);
  }, [editing, editDetail]);

  const patchOccurrence = (i: number, patch: Partial<OccurrenceRow>) =>
    setOccurrences((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));

  const togglePaper = (id: number) =>
    setPaperIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const occurrenceBody = (o: OccurrenceRow) => ({
    startTime: o.startTime || undefined,
    endTime: o.endTime || undefined,
    address: o.address || undefined,
    examinerName: o.examinerName || undefined,
  });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("请填写培训名称");
      return;
    }
    setSaving(true);
    try {
      const base = {
        name: name.trim(),
        type,
        paperIds,
        ownerId: ownerId || undefined,
        timeLimit: timeLimit ? Number(timeLimit) : undefined,
        recurrence: recurrence.trim() || null,
        recurrenceDay: recurrence ? recurrenceDay : null,
        recurrenceTime: recurrence ? recurrenceTime || null : null,
      };
      const rows = occurrences.filter(
        (o) => o.startTime || o.endTime || o.address || o.examinerName,
      );
      if (editing && editingId != null) {
        await updateTraining(editingId, base);
        const existingIds = new Set((editDetail?.occurrences ?? []).map((o) => o.id));
        for (const oid of existingIds) {
          if (!rows.some((r) => r.id === oid)) await deleteOccurrence(oid);
        }
        for (const o of rows) {
          if (o.id != null) await updateOccurrence(o.id, occurrenceBody(o));
          else await addOccurrence(editingId, occurrenceBody(o));
        }
      } else {
        const created = await createTraining({
          code: `training-${Date.now()}`,
          ...base,
        });
        for (const o of rows) {
          await addOccurrence(created.id, occurrenceBody(o));
        }
      }
      toast.success(editing ? "已保存" : "已创建");
      navigate("/console/admin/aro-binding");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleNewLocation = async (i: number) => {
    const name = await appPrompt("地点名称", "", { allowEmpty: false, placeholder: "如 浦东实验室" });
    if (name == null) return;
    const address = await appPrompt("地点地址", "", { allowEmpty: false, placeholder: "详细地址" });
    if (address == null) return;
    try {
      await addTrainingLocation(name.trim(), address.trim());
      await refetchLocations();
      patchOccurrence(i, { address: address.trim(), customAddress: false });
      toast.success("地点已添加");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "添加地点失败");
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
              <h2 className="text-base font-bold text-[var(--app-color-text-primary)]">{editing ? "编辑培训" : "发布培训"}</h2>
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
                <label className={adminLabelClass}>循环</label>
                <select
                  className={adminInputClass}
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value)}
                >
                  <option value="">无循环</option>
                  <option value="WEEKLY">每周</option>
                  <option value="DAILY">每天</option>
                </select>
              </div>
              {recurrence === "WEEKLY" && (
                <div className="space-y-1.5">
                  <label className={adminLabelClass}>星期几</label>
                  <select
                    className={adminInputClass}
                    value={recurrenceDay}
                    onChange={(e) => setRecurrenceDay(Number(e.target.value))}
                  >
                    <option value={1}>周一</option>
                    <option value={2}>周二</option>
                    <option value={3}>周三</option>
                    <option value={4}>周四</option>
                    <option value={5}>周五</option>
                    <option value={6}>周六</option>
                    <option value={7}>周日</option>
                  </select>
                </div>
              )}
              {recurrence && (
                <div className="space-y-1.5">
                  <label className={adminLabelClass}>起始时刻</label>
                  <input
                    className={adminInputClass}
                    type="time"
                    value={recurrenceTime}
                    onChange={(e) => setRecurrenceTime(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className={adminLabelClass}>所属人</label>
                <OwnerPicker ownerId={ownerId} ownerName={ownerName} onSelect={(id, n) => { setOwnerId(id); setOwnerName(n); }} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className={adminLabelClass}>试卷（可选，多选）</label>
                <PaperPicker
                  papers={papers}
                  folders={folders}
                  selected={paperIds}
                  onToggle={togglePaper}
                />
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
                      <div className="flex items-center gap-1.5">
                        <select
                          className={adminInputClass}
                          value={
                            o.customAddress || (o.address && !locations.some((l) => l.address === o.address))
                              ? "__custom__"
                              : o.address
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__custom__") patchOccurrence(i, { customAddress: true, address: "" });
                            else patchOccurrence(i, { customAddress: false, address: v });
                          }}
                        >
                          <option value="">选择地点…</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.address}>{l.name}</option>
                          ))}
                          <option value="__custom__">自定义地点…</option>
                        </select>
                        <AdminButton type="button" tone="secondary" size="sm" onClick={() => handleNewLocation(i)} title="新建地点">
                          <Plus className="h-3.5 w-3.5" />
                        </AdminButton>
                      </div>
                      {(o.customAddress || (o.address && !locations.some((l) => l.address === o.address))) && (
                        <input
                          className={adminInputClass}
                          value={o.address}
                          onChange={(e) => patchOccurrence(i, { address: e.target.value })}
                          placeholder="自定义地址"
                        />
                      )}
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
