import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { Pencil, Trash2, Plus, Loader2, Save, X, ChevronDown } from "lucide-react";
import {
  fetchBookingRoomAups,
  saveBookingAup,
  deleteBookingAup,
  fetchAupDict,
  type BookingAup,
} from "@/api/domains/cageShelf.api";
import type { BookingRoom } from "@/api/domains/cageShelf.api";
import { Search } from "lucide-react";

import { appConfirm } from "@/lib/appDialog";
interface Props {
  room: BookingRoom | null;
  roomId: string;
}

interface EditingState {
  id: string; // existing id, or "new" for insertion
  aupId: string;
  piName: string; // cascading: PI name → filter AUP options
  rentNumber: number;
  memo: string;
}

/* ================================================================
 * SearchableSelect — 搜索下拉组件（纯原生，不依赖 cmdk）
 * 打开即可滚动选择，也可输入关键字过滤
 * ================================================================ */
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "请选择…",
  disabled = false,
  className = "",
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // 打开时自动聚焦搜索框 + 重置搜索
  const handleOpen = () => {
    if (disabled) return;
    setOpen(v => {
      if (!v) { setSearch(""); setTimeout(() => inputRef.current?.focus(), 50); }
      return !v;
    });
  };

  const selected = options.find(o => o.value === value);
  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={`w-full rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs text-left flex items-center justify-between gap-1 transition ${
          disabled ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white hover:border-blue-400"
        }`}
      >
        <span className={`truncate ${selected ? "text-[var(--twin-ink)] font-medium" : "text-gray-400"}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" />
      </button>
      {open && !disabled && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full min-w-[160px] rounded-lg border border-[var(--app-color-border-default)] bg-white shadow-xl overflow-hidden">
          {/* 搜索框 */}
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="输入搜索…"
              className="flex-1 bg-transparent text-xs outline-none text-[var(--twin-ink)] placeholder:text-gray-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-gray-400">无匹配</div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value === value ? "" : o.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-2 py-1.5 text-xs rounded hover:bg-blue-50 transition ${
                    o.value === value ? "bg-blue-50 text-blue-700 font-medium" : "text-[var(--twin-ink)]"
                  }`}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CageBookingPanel({ room, roomId }: Props) {
  const [aups, setAups] = useState<BookingAup[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditingState>({ id: "", aupId: "", piName: "", rentNumber: 0, memo: "" });
  const [saving, setSaving] = useState(false);
  const [aupOptions, setAupOptions] = useState<{ id: string; registerNo: string; projectGroupName: string }[]>([]);

  const loadAups = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const raw = await fetchBookingRoomAups(roomId);
      // raw.data can be an array or nested in data.data
      const list: BookingAup[] = (raw as any)?.data ?? (raw as any) ?? [];
      setAups(Array.isArray(list) ? list : []);
    } catch (e: any) {
      toast.error(e?.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => { loadAups(); }, [loadAups]);

  useEffect(() => {
    fetchAupDict().then(list => setAupOptions(list.filter(a => a.id))).catch(() => {});
  }, [roomId]);

  // ── Derived: unique 课题组名 + AUP options filtered by selected 课题组 ──
  const piNames = useMemo(() => {
    const names = [...new Set(aupOptions.map(a => a.projectGroupName).filter(Boolean))];
    return names.sort((a, b) => a.localeCompare(b, "zh"));
  }, [aupOptions]);

  const aupOptionsByPi = useMemo(() => {
    if (!editState.piName) return [];
    return aupOptions.filter(a => a.projectGroupName === editState.piName);
  }, [aupOptions, editState.piName]);

  // ── Edit handlers ──

  const startEdit = (aup: BookingAup) => {
    setEditingId(aup.id);
    setEditState({ id: aup.id, aupId: aup.aupId || "", piName: aup.piName || "", rentNumber: aup.rentNumber ?? 0, memo: aup.memo || "" });
  };

  const startNew = () => {
    setEditingId("new");
    setEditState({ id: "new", aupId: "", piName: "", rentNumber: 0, memo: "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState({ id: "", aupId: "", piName: "", rentNumber: 0, memo: "" });
  };

  const handleSave = async () => {
    if (!roomId) return;
    if (editingId === "new" && !editState.aupId) { toast.error("请选择 AUP"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { rentNumber: editState.rentNumber, memo: editState.memo };
      if (editingId === "new") {
        body.aupId = editState.aupId;
      } else {
        body.id = editingId;
        body.aupId = editState.aupId;
      }
      await saveBookingAup(roomId, body);
      toast.success(editingId === "new" ? "新增成功" : "保存成功");
      cancelEdit();
      loadAups();
    } catch (e: any) { toast.error(e?.message || "保存失败"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!await appConfirm("确定删除此分配记录？")) return;
    try {
      await deleteBookingAup(id);
      toast.success("已删除");
      loadAups();
    } catch (e: any) { toast.error(e?.message || "删除失败"); }
  };

  // ── Computed ──

  const total = room?.animalCageNumber ?? 0;
  const booked = room?.rentAnimalCageNumber ?? 0;
  const used = room?.usedAnimalCageNumber ?? 0;
  const remaining = Math.max(0, total - booked);
  const bookedPct = total > 0 ? Math.round((booked / total) * 100) : 0;
  const usedPct = total > 0 ? Math.round((used / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* ── 房间概览卡片 ── */}
      {room && (
        <div className="shrink-0 rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-[var(--twin-ink)]">{room.name}</h3>
              <p className="text-xs text-[var(--twin-mute)]">{room.description}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-[var(--twin-ink)]">{remaining}</div>
              <div className="text-[10px] text-[var(--twin-mute)]">剩余可用</div>
            </div>
          </div>
          {/* 进度条 */}
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-[var(--twin-mute)]">已预约</span>
                <span className="font-medium text-[var(--twin-ink)]">{booked} / {total}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--twin-canvas-soft)] overflow-hidden">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${bookedPct}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-[var(--twin-mute)]">已使用</span>
                <span className="font-medium text-[var(--twin-ink)]">{used} / {total}</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--twin-canvas-soft)] overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${usedPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AUP 分配表格 ── */}
      <div className="flex-1 min-h-0 flex flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-[var(--twin-hairline)]">
          <span className="text-sm font-semibold text-[var(--twin-ink)]">AUP 分配明细</span>
          <button
            type="button"
            onClick={startNew}
            disabled={editingId === "new"}
            className="inline-flex items-center gap-1 rounded-twin-md px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />新增分配
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--twin-mute)]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />加载中…
            </div>
          ) : aups.length === 0 && editingId !== "new" ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center text-sm text-[var(--twin-mute)]">
              <p>暂无分配记录</p>
              <p className="text-[11px] mt-1">点击"新增分配"为此房间添加课题组</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] border-b-2 border-[var(--app-color-border-strong)]">
                <tr className="text-[var(--app-color-text-secondary)] font-bold">
                  <th className="px-3 py-2">课题组</th>
                  <th className="px-3 py-2">AUP 编号</th>
                  <th className="px-3 py-2 w-24">预约数量</th>
                  <th className="px-3 py-2 w-20">已使用</th>
                  <th className="px-3 py-2">备注</th>
                  <th className="px-3 py-2 w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {/* ── 新增行 ── */}
                {editingId === "new" && (
                  <tr className="border-b bg-blue-50/40">
                    <td className="px-3 py-2">
                      <SearchableSelect
                        options={piNames.map(n => ({ value: n, label: n }))}
                        value={editState.piName}
                        onChange={(piName) => setEditState(s => ({ ...s, piName, aupId: "" }))}
                        placeholder="选择课题组…"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <SearchableSelect
                        options={aupOptionsByPi.map(a => ({ value: a.id, label: a.registerNo || "" }))}
                        value={editState.aupId}
                        onChange={(aupId) => setEditState(s => ({ ...s, aupId }))}
                        placeholder={editState.piName ? "选择 AUP 编号…" : "请先选课题组"}
                        disabled={!editState.piName}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={editState.rentNumber}
                        onChange={e => setEditState(s => ({ ...s, rentNumber: parseInt(e.target.value) || 0 }))}
                        className="w-full rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs"
                        min={0}
                      />
                    </td>
                    <td className="px-3 py-2 text-[var(--twin-mute)]">—</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={editState.memo}
                        onChange={e => setEditState(s => ({ ...s, memo: e.target.value }))}
                        className="w-full rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={handleSave} disabled={saving} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="保存">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={cancelEdit} className="p-1 rounded text-[var(--twin-mute)] hover:bg-[var(--app-color-surface-hover)]" title="取消">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* ── 现有行 ── */}
                {aups.map(aup => (
                  editingId === aup.id ? (
                    <tr key={aup.id} className="border-b bg-blue-50/40">
                      <td className="px-3 py-2">
                        <SearchableSelect
                          options={piNames.map(n => ({ value: n, label: n }))}
                          value={editState.piName}
                          onChange={(piName) => setEditState(s => ({ ...s, piName, aupId: "" }))}
                          placeholder="选择课题组…"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SearchableSelect
                          options={aupOptionsByPi.map(a => ({ value: a.id, label: a.registerNo || "" }))}
                          value={editState.aupId}
                          onChange={(aupId) => setEditState(s => ({ ...s, aupId }))}
                          placeholder={editState.piName ? "选择 AUP 编号…" : "请先选课题组"}
                          disabled={!editState.piName}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={editState.rentNumber}
                          onChange={e => setEditState(s => ({ ...s, rentNumber: parseInt(e.target.value) || 0 }))}
                          className="w-full rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs"
                          min={0}
                        />
                      </td>
                      <td className="px-3 py-2">{aup.usedAnimalCageNumber}</td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editState.memo}
                          onChange={e => setEditState(s => ({ ...s, memo: e.target.value }))}
                          className="w-full rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={handleSave} disabled={saving} className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="保存">
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          </button>
                          <button onClick={cancelEdit} className="p-1 rounded text-[var(--twin-mute)] hover:bg-[var(--app-color-surface-hover)]" title="取消">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={aup.id} className="border-b hover:bg-[var(--twin-canvas-soft)] transition-colors">
                      <td className="px-3 py-2 font-medium text-[var(--twin-ink)]">{aup.piName}</td>
                      <td className="px-3 py-2 text-[var(--twin-mute)] font-mono text-[11px]">{aup.registerNumber}</td>
                      <td className="px-3 py-2 font-medium">{aup.rentNumber}</td>
                      <td className="px-3 py-2">{aup.usedAnimalCageNumber}</td>
                      <td className="px-3 py-2 text-[var(--twin-mute)] max-w-[120px] truncate">{aup.memo || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(aup)} className="p-1 rounded text-[var(--twin-mute)] hover:text-blue-600 hover:bg-blue-50" title="编辑">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(aup.id)} className="p-1 rounded text-[var(--twin-mute)] hover:text-red-600 hover:bg-red-50" title="删除">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
