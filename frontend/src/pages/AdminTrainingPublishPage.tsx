import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { ChevronLeft, ChevronDown, Plus, Search, Trash2, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import {
  createTraining,
  updateTraining,
  fetchTraining,
  addOccurrence,
  updateOccurrence,
  deleteOccurrence,
  fetchTrainingLocations,
  addTrainingLocation,
  fetchTrainingTypePresets,
  createTrainingTypePreset,
} from "@/api/domains/training.api";
import { fetchExamPapers, fetchExamFolders } from "@/features/exam/api/examPaper.api";
import type { ExamPaperSummary, ExamPaperFolder } from "@/features/exam/api/examPaper.api";
import { appPrompt } from "@/lib/appDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface OccurrenceRow {
  id?: number;
  startTime: string;
  endTime: string;
  address: string;
  timeLimit: string;
}

const emptyOccurrence = (): OccurrenceRow => ({
  startTime: "",
  endTime: "",
  address: "",
  timeLimit: "",
});

/** "yyyy-MM-dd HH:mm:ss"（后端墙钟）→ datetime-local 的 "yyyy-MM-ddTHH:mm" */
const toDatetimeLocal = (s?: string | null) => (s ? s.replace(" ", "T").slice(0, 16) : "");

/** 试卷多选下拉：按文件夹分组、可折叠、支持按标题/编码搜索 */
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

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
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(adminInputClass, "flex items-center justify-between text-left")}
      >
        <span className={selected.length ? "text-neutral-900" : "text-neutral-400"}>
          {selected.length ? `已选 ${selected.length} 套试卷` : "选择试卷…"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[20rem] rounded-lg border border-neutral-200 bg-white shadow-lg">
          <div className="p-2 pb-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索试卷标题 / 编码"
                className={cn(adminInputClass, "pl-8")}
              />
            </div>
          </div>
          <div className="max-h-64 space-y-1 overflow-auto p-2">
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
      )}
    </div>
  );
}

export default function AdminTrainingPublishPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const editing = editingId != null;

  const [name, setName] = useState("");
  const [typeName, setTypeName] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [recurrenceTime, setRecurrenceTime] = useState("");
  const [recurrenceStart, setRecurrenceStart] = useState("");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [ownerNames, setOwnerNames] = useState<string[]>([]);
  const [paperIds, setPaperIds] = useState<number[]>([]);
  const [occurrences, setOccurrences] = useState<OccurrenceRow[]>([]);
  const [form, setForm] = useState<OccurrenceRow>(emptyOccurrence());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [occurrenceDialogOpen, setOccurrenceDialogOpen] = useState(false);
  const [recurrenceDialogOpen, setRecurrenceDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [locName, setLocName] = useState("");
  const [locAddress, setLocAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  const { data: typePresets = [], refetch: refetchTypePresets } = useQuery({
    queryKey: ["training-type-presets"],
    queryFn: fetchTrainingTypePresets,
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
    setTypeName(editDetail.typeName ?? "");
    setRecurrence(editDetail.recurrence ?? "");
    setRecurrenceDay(editDetail.recurrenceDay ?? 1);
    setRecurrenceTime(editDetail.recurrenceTime ?? "");
    setRecurrenceStart(editDetail.recurrenceStart ?? "");
    setRecurrenceEnd(editDetail.recurrenceEnd ?? "");
    setOwnerIds(editDetail.ownerIds ?? []);
    setOwnerNames(editDetail.ownerIds ?? []);
    setPaperIds(editDetail.paperIds ?? []);
    const occs = (editDetail.occurrences ?? []).map((o) => ({
      id: o.id,
      startTime: toDatetimeLocal(o.startTime),
      endTime: toDatetimeLocal(o.endTime),
      address: o.address ?? "",
      timeLimit: o.timeLimit != null ? String(o.timeLimit) : "",
    }));
    setOccurrences(occs);
  }, [editing, editDetail]);

  const openOccurrenceDialog = (index: number | null) => {
    if (index == null) {
      setForm(emptyOccurrence());
      setEditingIndex(null);
    } else {
      setForm({ ...occurrences[index] });
      setEditingIndex(index);
    }
    setOccurrenceDialogOpen(true);
  };

  const confirmOccurrence = () => {
    if (editingIndex == null) {
      setOccurrences((prev) => [...prev, form]);
    } else {
      setOccurrences((prev) => prev.map((o, i) => (i === editingIndex ? form : o)));
    }
    setOccurrenceDialogOpen(false);
  };

  const togglePaper = (id: number) =>
    setPaperIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const occurrenceBody = (o: OccurrenceRow) => ({
    startTime: o.startTime || undefined,
    endTime: o.endTime || undefined,
    address: o.address || undefined,
    timeLimit: o.timeLimit ? Number(o.timeLimit) : undefined,
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
        typeName: typeName || undefined,
        paperIds,
        ownerIds,
        recurrence: recurrence.trim() || null,
        recurrenceDay: recurrence ? recurrenceDay : null,
        recurrenceTime: recurrence ? recurrenceTime || null : null,
        recurrenceStart: recurrenceStart.trim() || null,
        recurrenceEnd: recurrenceEnd.trim() || null,
      };
      const rows = occurrences.filter(
        (o) => o.startTime || o.endTime || o.address || o.timeLimit,
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

  const handleNewType = async () => {
    const name = await appPrompt("类型名称", "", { allowEmpty: false, placeholder: "如 准入培训" });
    if (name == null) return;
    try {
      const created = await createTrainingTypePreset(name.trim());
      await refetchTypePresets();
      setTypeName(created.name);
      toast.success("类型已添加");
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "添加类型失败");
    }
  };

  const submitNewLocation = async () => {
    const name = locName.trim();
    const address = locAddress.trim();
    if (!name || !address) {
      toast.error("请填写地点名称和地址");
      return;
    }
    try {
      await addTrainingLocation(name, address);
      await refetchLocations();
      setForm((f) => ({ ...f, address }));
      setLocationDialogOpen(false);
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

        <div className="min-h-0 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 overflow-hidden">
          <AdminFormCard title="基本信息" fill>
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
                <div className="flex items-center gap-1.5">
                  <select
                    className={adminInputClass}
                    value={typeName}
                    onChange={(e) => setTypeName(e.target.value)}
                  >
                    <option value="">选择类型…</option>
                    {typePresets.map((t) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                  <AdminButton type="button" tone="secondary" size="sm" onClick={handleNewType} title="新建类型">
                    <Plus className="h-3.5 w-3.5" />
                  </AdminButton>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={adminLabelClass}>所属人</label>
                <div className={cn(adminInputClass, "flex min-h-[2.5rem] flex-wrap items-center gap-1.5")}>
                  {ownerNames.length === 0 && <span className="text-neutral-400">未选择</span>}
                  {ownerNames.map((n, i) => (
                    <span
                      key={ownerIds[i] ?? i}
                      className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
                    >
                      {n}
                      <button
                        type="button"
                        onClick={() => {
                          setOwnerIds((prev) => prev.filter((_, idx) => idx !== i));
                          setOwnerNames((prev) => prev.filter((_, idx) => idx !== i));
                        }}
                        className="text-neutral-400 transition-colors hover:text-rose-500"
                        aria-label="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="inline-flex items-center gap-1 text-xs text-[var(--app-color-primary)] hover:underline"
                  >
                    <Plus className="h-3 w-3" />选择所属人
                  </button>
                </div>
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
            fill
            actions={
              <div className="flex items-center gap-2">
                <AdminButton type="button" tone="secondary" size="sm" onClick={() => setRecurrenceDialogOpen(true)}>
                  配置
                </AdminButton>
                <AdminButton type="button" tone="primary" size="sm" onClick={() => openOccurrenceDialog(null)}>
                  <Plus className="mr-1 h-3.5 w-3.5" />添加场次
                </AdminButton>
              </div>
            }
          >
            {occurrences.length === 0 ? (
              <div className="py-8 text-center text-sm text-neutral-400">暂无场次</div>
            ) : (
              <div className="space-y-2">
                {occurrences.map((o, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-neutral-800">
                        {o.startTime ? o.startTime.replace("T", " ") : "—"} ~{" "}
                        {o.endTime ? o.endTime.replace("T", " ") : "—"}
                      </div>
                      <div className="truncate text-xs text-neutral-500">
                        {o.address || "未指定地点"}
                        {o.timeLimit ? ` · 限时 ${o.timeLimit} 分钟` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openOccurrenceDialog(i)}
                      className="text-neutral-400 transition-colors hover:text-[var(--app-color-primary)]"
                      aria-label="编辑场次"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOccurrences((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-neutral-400 transition-colors hover:text-rose-500"
                      aria-label="删除场次"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AdminFormCard>
        </div>
      </div>

      <Dialog open={occurrenceDialogOpen} onOpenChange={setOccurrenceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingIndex == null ? "添加场次" : "编辑场次"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={adminLabelClass}>开始时间</label>
              <input
                className={adminInputClass}
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className={adminLabelClass}>结束时间</label>
              <input
                className={adminInputClass}
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className={adminLabelClass}>地点</label>
              <div className="flex items-center gap-1.5">
                <select
                  className={adminInputClass}
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                >
                  <option value="">选择地点…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.address}>{l.name}</option>
                  ))}
                </select>
                <AdminButton type="button" tone="secondary" size="sm" onClick={() => { setLocName(""); setLocAddress(""); setLocationDialogOpen(true); }} title="新建地点">
                  <Plus className="h-3.5 w-3.5" />
                </AdminButton>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={adminLabelClass}>时间限制（分钟）</label>
              <input
                className={adminInputClass}
                type="number"
                min={0}
                value={form.timeLimit}
                onChange={(e) => setForm((f) => ({ ...f, timeLimit: e.target.value }))}
                placeholder="如 60"
              />
            </div>
          </div>
          <DialogFooter>
            <AdminButton type="button" tone="secondary" size="default" onClick={() => setOccurrenceDialogOpen(false)}>
              取消
            </AdminButton>
            <AdminButton type="button" tone="primary" size="default" onClick={confirmOccurrence}>
              确定
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建地点</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={adminLabelClass}>地点名称</label>
              <input
                className={adminInputClass}
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                placeholder="如 浦东实验室"
              />
            </div>
            <div className="space-y-1.5">
              <label className={adminLabelClass}>地点地址</label>
              <input
                className={adminInputClass}
                value={locAddress}
                onChange={(e) => setLocAddress(e.target.value)}
                placeholder="详细地址"
              />
            </div>
          </div>
          <DialogFooter>
            <AdminButton type="button" tone="secondary" size="default" onClick={() => setLocationDialogOpen(false)}>
              取消
            </AdminButton>
            <AdminButton type="button" tone="primary" size="default" onClick={submitNewLocation}>
              确定
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recurrenceDialogOpen} onOpenChange={setRecurrenceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>自动发布场次配置</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={adminLabelClass}>循环</label>
              <select
                className={adminInputClass}
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
              >
                <option value="">无循环</option>
                <option value="WEEKLY">每周</option>
                <option value="MONTHLY">每月</option>
                <option value="QUARTERLY">每三个月</option>
                <option value="YEARLY">每年</option>
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
            {["MONTHLY", "QUARTERLY", "YEARLY"].includes(recurrence) && (
              <div className="space-y-1.5">
                <label className={adminLabelClass}>几号</label>
                <select
                  className={adminInputClass}
                  value={recurrenceDay}
                  onChange={(e) => setRecurrenceDay(Number(e.target.value))}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}号</option>
                  ))}
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
              <label className={adminLabelClass}>起始日期</label>
              <input
                className={adminInputClass}
                type="date"
                value={recurrenceStart}
                onChange={(e) => setRecurrenceStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className={adminLabelClass}>截至日期</label>
              <input
                className={adminInputClass}
                type="date"
                value={recurrenceEnd}
                onChange={(e) => setRecurrenceEnd(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <AdminButton type="button" tone="primary" size="default" onClick={() => setRecurrenceDialogOpen(false)}>
              确定
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pickerOpen &&
        createPortal(
          <PersonnelPicker
            onClose={() => setPickerOpen(false)}
            onConfirm={(ids, names) => {
              setOwnerIds(ids);
              setOwnerNames(names);
              setPickerOpen(false);
            }}
          />,
          document.body,
        )}
    </AdminPageShell>
  );
}
