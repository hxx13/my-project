import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus, Pencil, Trash2, Shield, X, User, ArrowLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAccessRules,
  fetchAccessRuleDetail,
  createAccessRule,
  updateAccessRule,
  deleteAccessRule,
  fetchRoomMappingRooms,
  fetchDahuaDoorGroups,
  fetchDahuaDeviceChannelRemarkCategories,
  searchPersonnel,
  type AccessRuleListRow,
  type AccessRuleItemPayload,
  type AccessRuleDetailView,
  type RoomMappingRoomRow,
  type DahuaDoorGroupRow,
  type DahuaDeviceChannelRemarkCategory,
} from "@/api/twinApi";
import { Portal } from "@/components/Portal";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { DahuaChannelListPicker } from "@/components/admin/DahuaChannelListPicker";
import { TransferListPicker } from "@/components/admin/TransferListPicker";

function emptyItem(): AccessRuleItemPayload {
  return { roomId: "", channelCodes: [], doorGroupIds: [], aroUserIds: [] };
}

export default function AdminAccessRulesPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [items, setItems] = useState<AccessRuleItemPayload[]>([emptyItem()]);

  const [roomOptions, setRoomOptions] = useState<RoomMappingRoomRow[]>([]);
  const [doorGroups, setDoorGroups] = useState<DahuaDoorGroupRow[]>([]);
  const [remarkCategories, setRemarkCategories] = useState<DahuaDeviceChannelRemarkCategory[]>([]);

  const [personKeyword, setPersonKeyword] = useState("");
  const [personHits, setPersonHits] = useState<any[]>([]);
  const [personItemIdx, setPersonItemIdx] = useState<number | null>(null);
  const personTimer = useRef<number | null>(null);

  const qc = useQueryClient();
  const accessRulesQueryKey = ["accessRules", { page, pageSize, keyword: appliedKeyword }] as const;

  const { data: rulesData, isLoading } = useQuery({
    queryKey: accessRulesQueryKey,
    queryFn: () => fetchAccessRules({ page, pageSize, keyword: appliedKeyword }),
    placeholderData: (prev) => prev,
  });
  const list = rulesData?.list ?? [];
  const total = rulesData?.total ?? 0;

  const createMut = useMutation({
    mutationFn: createAccessRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accessRules"] });
      toast.success("已创建规则");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAccessRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accessRules"] });
      toast.success("已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const loadMetaForEditor = async () => {
    try {
      const [roomsRes, dgRes, remarkRes] = await Promise.all([
        fetchRoomMappingRooms({ page: 1, pageSize: 500, includeChannels: false }),
        fetchDahuaDoorGroups(1, 500, ""),
        fetchDahuaDeviceChannelRemarkCategories(),
      ]);
      setRoomOptions(roomsRes.list || []);
      setDoorGroups(dgRes.list || []);
      setRemarkCategories(remarkRes || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载下拉数据失败");
    }
  };

  const openCreate = async () => {
    setEditingId(null);
    setFormName("");
    setFormEnabled(true);
    setItems([emptyItem()]);
    setPersonItemIdx(null);
    setEditorOpen(true);
    await loadMetaForEditor();
  };

  const openEdit = async (id: number) => {
    setSaving(true);
    try {
      const d: AccessRuleDetailView = await fetchAccessRuleDetail(id);
      setEditingId(id);
      setFormName(d.name || "");
      setFormEnabled(d.enabled !== false);
      setItems(d.items?.length ? d.items.map((it) => ({ ...it })) : [emptyItem()]);
      setPersonItemIdx(null);
      setEditorOpen(true);
      await loadMetaForEditor();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载详情失败");
    } finally {
      setSaving(false);
    }
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setPersonHits([]);
    setPersonKeyword("");
  };

  const addItemRow = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItemRow = (idx: number) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const setItemDoorGroups = (itemIdx: number, ids: number[]) => {
    setItems((prev) => {
      const next = [...prev];
      next[itemIdx] = { ...next[itemIdx], doorGroupIds: ids };
      return next;
    });
  };

  const setItemChannelCodes = (itemIdx: number, codes: string[]) => {
    setItems((prev) => {
      const next = [...prev];
      next[itemIdx] = { ...next[itemIdx], channelCodes: codes };
      return next;
    });
  };

  const addPerson = (itemIdx: number, raw: any) => {
    const uid = String(raw.userid || raw.user_id || raw.id || "").trim();
    if (!uid) return;
    const name = raw.name || raw.username || uid;
    setItems((prev) => {
      const next = [...prev];
      const row = { ...next[itemIdx], aroUserIds: [...(next[itemIdx].aroUserIds || [])] };
      if (!row.aroUserIds.includes(uid)) row.aroUserIds.push(uid);
      next[itemIdx] = row;
      return next;
    });
    setPersonHits([]);
    setPersonKeyword(`${name} (${uid})`);
    toast.success("已添加人员");
  };

  const removePerson = (itemIdx: number, uid: string) => {
    setItems((prev) => {
      const next = [...prev];
      const row = { ...next[itemIdx], aroUserIds: (next[itemIdx].aroUserIds || []).filter((x) => x !== uid) };
      next[itemIdx] = row;
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (personTimer.current) window.clearTimeout(personTimer.current);
    };
  }, []);

  const onPersonSearch = (idx: number, val: string) => {
    setPersonItemIdx(idx);
    setPersonKeyword(val);
    if (personTimer.current) window.clearTimeout(personTimer.current);
    personTimer.current = window.setTimeout(async () => {
      const kw = val.trim();
      if (!kw) {
        setPersonHits([]);
        return;
      }
      try {
        const { data: res } = await searchPersonnel(kw);
        setPersonHits(Array.isArray(res) ? res : []);
      } catch {
        setPersonHits([]);
      }
    }, 280);
  };

  const handleSave = async () => {
    const body = {
      name: formName.trim(),
      enabled: formEnabled,
      items: items.map((it, i) => ({
        ...it,
        roomId: it.roomId?.trim() || "",
        sortOrder: i,
      })),
    };
    if (!body.name) {
      toast.error("请填写规则名称");
      return;
    }
    setSaving(true);
    try {
      if (editingId == null) {
        await createMut.mutateAsync(body);
        closeEditor();
      } else {
        await updateAccessRule(editingId, body);
        qc.invalidateQueries({ queryKey: ["accessRules"] });
        toast.success("已保存");
        closeEditor();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: AccessRuleListRow) => {
    if (!window.confirm(`确定删除规则「${row.name || row.ruleCode}」？`)) return;
    deleteMut.mutate(row.id);
  };

  const sortedDoorGroups = [...doorGroups].sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-CN"));

  return (
    <AdminPageShell>
      <div className="flex items-center gap-3 shrink-0">
        <span className="inline-flex items-center gap-2">
          <Shield className="h-6 w-6 shrink-0 text-[var(--twin-link-deep)]" aria-hidden />
          门禁规则配置
        </span>
        <AdminButton type="button" tone="primary" className="inline-flex items-center gap-2 ml-auto" onClick={() => void openCreate()}>
          <Plus className="h-4 w-4" aria-hidden />
          新增规则
        </AdminButton>
      </div>
      <div className="flex flex-col gap-4 max-h-[calc(100dvh-var(--admin-chrome-offset)-48px)] min-h-[200px] overflow-y-auto">
      <AdminFormCard title="筛选" description={`共 ${total} 条规则`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={adminLabelClass}>关键词（名称 / 编号）</span>
            <input
              className={adminInputClass}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (setAppliedKeyword(keyword), setPage(1))}
              placeholder="输入后回车或点查询"
            />
          </label>
          <AdminButton
            type="button"
            tone="primary"
            onClick={() => {
              setAppliedKeyword(keyword);
              setPage(1);
            }}
          >
            查询
          </AdminButton>
        </div>
      </AdminFormCard>

      <AdminTableShell loading={isLoading} empty={!isLoading && list.length === 0} emptyMessage="暂无规则，点击「新增规则」开始配置" scrollable>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="border-b px-3 py-2 text-left font-medium">编号</th>
                <th className="border-b px-3 py-2 text-left font-medium">名称</th>
                <th className="border-b px-3 py-2 text-left font-medium">状态</th>
                <th className="border-b px-3 py-2 text-left font-medium">更新</th>
                <th className="border-b px-3 py-2 text-right font-medium w-36">操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-[var(--twin-canvas-soft)]">
                  <td className="border-b border-[var(--twin-hairline)] px-3 py-2 font-mono text-xs">{r.ruleCode || "—"}</td>
                  <td className="border-b border-[var(--twin-hairline)] px-3 py-2">{r.name || "—"}</td>
                  <td className="border-b border-[var(--twin-hairline)] px-3 py-2">
                    {r.enabled === 1 ? (
                      <span className="text-emerald-700">启用</span>
                    ) : (
                      <span className="text-[var(--twin-mute)]">停用</span>
                    )}
                  </td>
                  <td className="border-b border-[var(--twin-hairline)] px-3 py-2 text-xs text-[var(--twin-mute)] whitespace-nowrap">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <AdminButton type="button" tone="ghost" size="sm" className="mr-1 gap-1" onClick={() => void openEdit(r.id)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> 编辑
                    </AdminButton>
                    <AdminButton type="button" tone="destructive" size="sm" className="gap-1" onClick={() => void handleDelete(r)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> 删除
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </AdminTableShell>

      <div className="flex items-center justify-end gap-2 text-sm text-[var(--twin-body)]">
        <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          上一页
        </AdminButton>
        <span>
          第 {page} 页，共 {total} 条
        </span>
        <AdminButton type="button" tone="secondary" size="sm" disabled={page * pageSize >= total || isLoading} onClick={() => setPage((p) => p + 1)}>
          下一页
        </AdminButton>
      </div>

      {editorOpen && <Portal><div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-twin-xl bg-[var(--twin-canvas)] p-6 shadow-twin-level-3"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--twin-hairline)] pb-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--twin-body)] shadow-twin-level-1 hover:bg-[var(--twin-canvas-soft)]"
                  onClick={closeEditor}
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                  返回列表
                </button>
                <h2 className="min-w-0 truncate text-lg font-semibold text-[var(--twin-ink)]">
                  {editingId ? "编辑规则" : "新增规则"}
                </h2>
              </div>
              <button type="button" className="shrink-0 rounded-full p-1.5 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)]" onClick={closeEditor} aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>

            <AdminFormCard title="基本信息" description="规则名称与启用状态。">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={adminLabelClass}>规则名称</span>
                  <input className={adminInputClass} value={formName} onChange={(e) => setFormName(e.target.value)} />
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2.5 md:mt-6">
                  <AdminSwitchScaled size="sm" checked={formEnabled} onChange={(checked) => setFormEnabled(checked)} />
                  <span className="text-sm text-[var(--twin-ink)]">{formEnabled ? "已启用" : "已停用"}</span>
                </label>
              </div>
            </AdminFormCard>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--twin-ink)]">子规则（房间 + 授权 + 人员）</h3>
                <AdminButton type="button" tone="ghost" size="sm" onClick={addItemRow}>
                  + 添加子规则
                </AdminButton>
              </div>

              {items.map((it, idx) => (
                <div key={idx} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--twin-mute)]">子规则 #{idx + 1}</span>
                    {items.length > 1 && (
                      <AdminButton type="button" tone="destructive" size="sm" onClick={() => removeItemRow(idx)}>
                        删除
                      </AdminButton>
                    )}
                  </div>

                  <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                    ARO 房间
                    <select
                      className={adminInputClass}
                      value={it.roomId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setItems((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx], roomId: v };
                          return n;
                        });
                      }}
                    >
                      <option value="">请选择房间</option>
                      {roomOptions.map((r) => (
                        <option key={r.roomId || r.id} value={r.roomId || ""}>
                          {(r.roomId || "") + " — " + (r.roomName || "")}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <div className="text-xs font-medium text-[var(--twin-body)] mb-1">门组（多选）</div>
                    <TransferListPicker
                      options={sortedDoorGroups.map((g) => ({
                        value: String(g.id),
                        label: g.name || `门组${g.id}`,
                        meta: `#${g.id}`,
                      }))}
                      selected={(it.doorGroupIds || []).map(String)}
                      onChange={(values) => setItemDoorGroups(idx, values.map(Number))}
                      idPrefix={`access-rule-${idx}-door`}
                      availableLabel="可选门组"
                      pickedLabel="已选门组"
                      availableSearchPlaceholder="搜索可选门组"
                      pickedSearchPlaceholder="搜索已选门组"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-medium text-[var(--twin-body)] mb-1">通道（多选）</div>
                    <DahuaChannelListPicker
                      selected={it.channelCodes || []}
                      onChange={(codes) => setItemChannelCodes(idx, codes)}
                      remarkCategories={remarkCategories}
                      idPrefix={`access-rule-${idx}`}
                    />
                  </div>

                  <div className="relative">
                    <div className="text-xs font-medium text-[var(--twin-body)] mb-1 flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      人员（可选，检索添加，可多名；留空则按房间匹配）
                    </div>
                    <input
                      className={adminInputClass}
                      placeholder="输入姓名或工号检索…"
                      value={personItemIdx === idx ? personKeyword : ""}
                      onFocus={() => setPersonItemIdx(idx)}
                      onChange={(e) => onPersonSearch(idx, e.target.value)}
                    />
                    {personItemIdx === idx && personHits.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-3">
                        {personHits.map((raw, i) => {
                          const uid = String(raw.userid || raw.user_id || raw.id || "");
                          const name = raw.name || raw.username || uid;
                          return (
                            <button
                              key={uid || i}
                              type="button"
                              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[var(--twin-canvas-soft)]"
                              onClick={() => addPerson(idx, raw)}
                            >
                              <span className="font-medium text-[var(--twin-ink)]">{name}</span>
                              <span className="font-mono text-xs text-[var(--twin-mute)]">{uid}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(it.aroUserIds || []).map((uid) => (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900"
                        >
                          {uid}
                          <button type="button" className="text-emerald-600" onClick={() => removePerson(idx, uid)}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-[var(--twin-hairline)] pt-4">
              <AdminButton type="button" tone="secondary" onClick={closeEditor}>
                取消
              </AdminButton>
              <AdminButton type="button" tone="primary" disabled={saving} className="gap-2" onClick={() => void handleSave()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                保存
              </AdminButton>
            </div>
          </div>
        </div></Portal>}
    </div>
    </AdminPageShell>
  );
}
