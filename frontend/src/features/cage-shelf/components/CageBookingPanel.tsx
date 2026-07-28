import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Pencil, Trash2, Plus, Loader2, Save, X } from "lucide-react";
import {
  fetchBookingRoomAups,
  saveBookingAup,
  deleteBookingAup,
  fetchAupDict,
  type BookingAup,
} from "@/api/domains/cageShelf.api";
import type { BookingRoom } from "@/api/domains/cageShelf.api";

interface Props {
  room: BookingRoom | null;
  roomId: string;
  ensureCasBinding: () => boolean;
}

interface EditingState {
  id: string; // existing id, or "new" for insertion
  aupId: string;
  rentNumber: number;
  memo: string;
}

export default function CageBookingPanel({ room, roomId, ensureCasBinding }: Props) {
  const [aups, setAups] = useState<BookingAup[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditingState>({ id: "", aupId: "", rentNumber: 0, memo: "" });
  const [saving, setSaving] = useState(false);
  const [aupOptions, setAupOptions] = useState<{ id: string; title: string; registerNumber: string }[]>([]);

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

  // ── Edit handlers ──

  const startEdit = (aup: BookingAup) => {
    if (!ensureCasBinding()) return;
    setEditingId(aup.id);
    setEditState({ id: aup.id, aupId: aup.aupId || "", rentNumber: aup.rentNumber ?? 0, memo: aup.memo || "" });
  };

  const startNew = () => {
    if (!ensureCasBinding()) return;
    setEditingId("new");
    setEditState({ id: "new", aupId: "", rentNumber: 0, memo: "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState({ id: "", aupId: "", rentNumber: 0, memo: "" });
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
    if (!ensureCasBinding()) return;
    if (!confirm("确定删除此分配记录？")) return;
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
                  <th className="px-3 py-2">课题组长</th>
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
                      <select
                        value={editState.aupId}
                        onChange={e => setEditState(s => ({ ...s, aupId: e.target.value }))}
                        className="w-full rounded border border-[var(--app-color-border-default)] px-2 py-1 text-xs bg-white"
                      >
                        <option value="">选择 AUP…</option>
                        {aupOptions.map(a => (
                          <option key={a.id} value={a.id}>{a.title || a.registerNumber}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-[var(--twin-mute)]">—</td>
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
                      <td className="px-3 py-2 font-medium text-[var(--twin-ink)]">{aup.piName}</td>
                      <td className="px-3 py-2 text-[var(--twin-mute)]">{aup.registerNumber}</td>
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
