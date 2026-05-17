import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus, Pencil, Trash2, Shield, X, User, ArrowLeft } from "lucide-react";
import {
  fetchAccessRules,
  fetchAccessRuleDetail,
  createAccessRule,
  updateAccessRule,
  deleteAccessRule,
  fetchRoomMappingRooms,
  fetchDahuaDoorGroups,
  fetchDahuaDeviceChannels,
  fetchDahuaDeviceChannelRemarkCategories,
  searchPersonnel,
  type AccessRuleListRow,
  type AccessRuleItemPayload,
  type AccessRuleDetailView,
  type RoomMappingRoomRow,
  type DahuaDoorGroupRow,
  type DahuaDeviceChannelRow,
  type DahuaDeviceChannelRemarkCategory,
} from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import {
  labelForChannelRow,
  normalizeChannelCode,
  resolveChannelLabelsByCodes,
  useHydrateChannelNameMap,
} from "@/utils/dahuaChannelUtils";

function normalizeCode(code: string): string {
  return normalizeChannelCode(code);
}

function channelLabel(code: string, nameMap: Record<string, string>, rows: DahuaDeviceChannelRow[]): string {
  const key = normalizeCode(code);
  const nameByMap = (nameMap[key] || "").trim();
  if (nameByMap) return nameByMap;
  const row = rows.find((r) => normalizeCode(r.channelCode || "") === key);
  if (row) return labelForChannelRow(row);
  return labelForChannelRow({ channelCode: key, channelName: "" } as DahuaDeviceChannelRow);
}

function emptyItem(): AccessRuleItemPayload {
  return { roomId: "", channelCodes: [], doorGroupIds: [], aroUserIds: [] };
}

export default function AdminAccessRulesPage() {
  const [list, setList] = useState<AccessRuleListRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [loading, setLoading] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [items, setItems] = useState<AccessRuleItemPayload[]>([emptyItem()]);

  const [roomOptions, setRoomOptions] = useState<RoomMappingRoomRow[]>([]);
  const [doorGroups, setDoorGroups] = useState<DahuaDoorGroupRow[]>([]);
  const [remarkCategories, setRemarkCategories] = useState<DahuaDeviceChannelRemarkCategory[]>([]);

  const [channelKeyword, setChannelKeyword] = useState("");
  const [channelRemarkId, setChannelRemarkId] = useState<number | "">("");
  const [channelPage, setChannelPage] = useState(1);
  const [channelRows, setChannelRows] = useState<DahuaDeviceChannelRow[]>([]);
  const [channelTotal, setChannelTotal] = useState(0);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelNameMap, setChannelNameMap] = useState<Record<string, string>>({});
  /** 子规则索引 → 展开通道多选 */
  const [channelPanelItemIdx, setChannelPanelItemIdx] = useState<number | null>(null);

  const [personKeyword, setPersonKeyword] = useState("");
  const [personHits, setPersonHits] = useState<any[]>([]);
  const [personItemIdx, setPersonItemIdx] = useState<number | null>(null);
  const personTimer = useRef<number | null>(null);

  const allSelectedChannelCodes = items.flatMap((it) => it.channelCodes || []);

  useHydrateChannelNameMap(
    allSelectedChannelCodes,
    channelNameMap,
    setChannelNameMap,
    fetchDahuaDeviceChannels,
    editorOpen
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAccessRules({ page, pageSize, keyword: appliedKeyword });
      setList(data.list || []);
      setTotal(data.total || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, page, pageSize]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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

  const loadChannels = async (p: number, append: boolean) => {
    setChannelLoading(true);
    try {
      const res = await fetchDahuaDeviceChannels({
        page: p,
        pageSize: 30,
        keyword: channelKeyword.trim(),
        remarkCategoryId: channelRemarkId === "" ? undefined : Number(channelRemarkId),
      });
      const batch = res.list || [];
      setChannelNameMap((prev) => {
        const next = { ...prev };
        batch.forEach((row) => {
          const code = normalizeCode(row.channelCode || "");
          if (code) next[code] = labelForChannelRow(row);
        });
        return next;
      });
      setChannelRows((prev) => {
        if (!append) return batch;
        const merged = [...prev, ...batch];
        const seen = new Set<number>();
        return merged.filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        });
      });
      setChannelTotal(res.total || 0);
      setChannelPage(p);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载通道失败");
    } finally {
      setChannelLoading(false);
    }
  };

  useEffect(() => {
    if (!editorOpen || channelPanelItemIdx === null) return;
    void loadChannels(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅面板打开时按筛选重置列表
  }, [editorOpen, channelPanelItemIdx, channelRemarkId]);

  const openCreate = async () => {
    setEditingId(null);
    setFormName("");
    setFormEnabled(true);
    setItems([emptyItem()]);
    setChannelPanelItemIdx(null);
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
      setChannelPanelItemIdx(null);
      setPersonItemIdx(null);
      setEditorOpen(true);
      await loadMetaForEditor();
      const codes = (d.items || []).flatMap((it) => it.channelCodes || []);
      if (codes.length) {
        const labels = await resolveChannelLabelsByCodes(codes, fetchDahuaDeviceChannels);
        setChannelNameMap((prev) => ({ ...prev, ...labels }));
      }
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

  const toggleDoor = (itemIdx: number, id: number, checked: boolean) => {
    setItems((prev) => {
      const next = [...prev];
      const row = { ...next[itemIdx], doorGroupIds: [...(next[itemIdx].doorGroupIds || [])] };
      const set = new Set(row.doorGroupIds);
      if (checked) set.add(id);
      else set.delete(id);
      row.doorGroupIds = Array.from(set);
      next[itemIdx] = row;
      return next;
    });
  };

  const toggleChannel = (itemIdx: number, code: string, checked: boolean, row?: DahuaDeviceChannelRow) => {
    const cleanCode = normalizeCode(code);
    if (!cleanCode) return;
    if (checked && row) {
      setChannelNameMap((prev) => ({ ...prev, [cleanCode]: labelForChannelRow(row) }));
    }
    setItems((prev) => {
      const next = [...prev];
      const row = { ...next[itemIdx], channelCodes: [...(next[itemIdx].channelCodes || [])] };
      const set = new Set(row.channelCodes);
      if (checked) set.add(cleanCode);
      else set.delete(cleanCode);
      row.channelCodes = Array.from(set);
      next[itemIdx] = row;
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
        const res = await searchPersonnel(kw);
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
        await createAccessRule(body);
        toast.success("已创建规则");
        closeEditor();
        await loadList();
      } else {
        await updateAccessRule(editingId, body);
        // 保存后仅合并当前行，禁止整表 load（post-save-no-full-refresh.mdc）
        setList((prev) =>
          prev.map((r) =>
            r.id === editingId
              ? {
                  ...r,
                  name: body.name,
                  enabled: body.enabled ? 1 : 0,
                  updatedAt: new Date().toISOString(),
                }
              : r,
          ),
        );
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
    try {
      await deleteAccessRule(row.id);
      toast.success("已删除");
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const sortedDoorGroups = [...doorGroups].sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-CN"));

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <Shield className="h-6 w-6 shrink-0 text-[#0070f3]" aria-hidden />
          门禁规则配置
        </span>
      }
      description="配置房间、大华门组与通道；ARO 人员为可选。匹配顺序：同房间下优先匹配「房间+人员」，无人员项时按「仅房间」兜底。"
      actions={
        <AdminButton type="button" tone="primary" className="inline-flex items-center gap-2" onClick={() => void openCreate()}>
          <Plus className="h-4 w-4" aria-hidden />
          新增规则
        </AdminButton>
      }
    >
    <div className="flex flex-col gap-4">
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

      <AdminTableShell loading={loading} empty={!loading && list.length === 0} emptyMessage="暂无规则，点击「新增规则」开始配置" scrollable>
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
                <tr key={r.id} className="hover:bg-slate-50/80">
                  <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs">{r.ruleCode || "—"}</td>
                  <td className="border-b border-slate-100 px-3 py-2">{r.name || "—"}</td>
                  <td className="border-b border-slate-100 px-3 py-2">
                    {r.enabled === 1 ? (
                      <span className="text-emerald-700">启用</span>
                    ) : (
                      <span className="text-slate-400">停用</span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
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

      <div className="flex items-center justify-end gap-2 text-sm text-neutral-600">
        <AdminButton type="button" tone="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          上一页
        </AdminButton>
        <span>
          第 {page} 页，共 {total} 条
        </span>
        <AdminButton type="button" tone="secondary" size="sm" disabled={page * pageSize >= total || loading} onClick={() => setPage((p) => p + 1)}>
          下一页
        </AdminButton>
      </div>

      {editorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
                  onClick={closeEditor}
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                  返回列表
                </button>
                <h2 className="min-w-0 truncate text-lg font-semibold text-neutral-900">
                  {editingId ? "编辑规则" : "新增规则"}
                </h2>
              </div>
              <button type="button" className="shrink-0 rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100" onClick={closeEditor} aria-label="关闭">
                <X className="h-5 w-5" />
              </button>
            </div>

            <AdminFormCard title="基本信息" description="规则名称与启用状态。">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className={adminLabelClass}>规则名称</span>
                  <input className={adminInputClass} value={formName} onChange={(e) => setFormName(e.target.value)} />
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50/80 px-3 py-2.5 md:mt-6">
                  <input type="checkbox" className="h-4 w-4 rounded border-neutral-300" checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} />
                  <span className="text-sm text-neutral-800">{formEnabled ? "已启用" : "已停用"}</span>
                </label>
              </div>
            </AdminFormCard>

            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">子规则（房间 + 授权 + 人员）</h3>
                <AdminButton type="button" tone="ghost" size="sm" onClick={addItemRow}>
                  + 添加子规则
                </AdminButton>
              </div>

              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">子规则 #{idx + 1}</span>
                    {items.length > 1 && (
                      <AdminButton type="button" tone="destructive" size="sm" onClick={() => removeItemRow(idx)}>
                        删除
                      </AdminButton>
                    )}
                  </div>

                  <label className="flex flex-col gap-1 text-xs text-slate-600">
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
                    <div className="text-xs font-medium text-slate-600 mb-1">门组（多选）</div>
                    <div className="max-h-40 overflow-auto rounded border border-slate-200 p-2">
                      {sortedDoorGroups.map((g) => {
                        const checked = (it.doorGroupIds || []).includes(g.id);
                        return (
                          <label key={g.id} className="flex items-center gap-2 py-0.5 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleDoor(idx, g.id, e.target.checked)}
                            />
                            <span>{g.name || `门组${g.id}`}</span>
                            <span className="text-xs text-slate-400">#{g.id}</span>
                          </label>
                        );
                      })}
                      {sortedDoorGroups.length === 0 && <div className="text-xs text-slate-400">暂无门组缓存</div>}
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-600">通道（多选）</span>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => setChannelPanelItemIdx(channelPanelItemIdx === idx ? null : idx)}
                      >
                        {channelPanelItemIdx === idx ? "收起通道列表" : "选择通道…"}
                      </button>
                    </div>
                    {(it.channelCodes || []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(it.channelCodes || []).map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-900"
                            title={`编码: ${c}`}
                          >
                            {channelLabel(c, channelNameMap, channelRows)}
                            <button
                              type="button"
                              className="text-indigo-500 hover:text-indigo-800"
                              onClick={() => toggleChannel(idx, c, false)}
                              aria-label="移除"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {channelPanelItemIdx === idx && (
                      <div className="mt-2 rounded border border-slate-200 p-3 space-y-2 bg-slate-50/80">
                        <div className="flex flex-wrap gap-2">
                          <input
                            className={cn(adminInputClass, "min-w-[8rem] flex-1 py-1.5 text-sm")}
                            placeholder="通道关键字（支持名称/编码搜索）"
                            value={channelKeyword}
                            onChange={(e) => setChannelKeyword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && void loadChannels(1, false)}
                          />
                          <select
                            className="rounded border px-2 py-1 text-sm"
                            value={channelRemarkId}
                            onChange={(e) => setChannelRemarkId(e.target.value === "" ? "" : Number(e.target.value))}
                          >
                            <option value="">全部分类</option>
                            {remarkCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="rounded bg-slate-800 px-3 py-1 text-xs text-white"
                            onClick={() => void loadChannels(1, false)}
                          >
                            搜索
                          </button>
                        </div>
                        <div className="max-h-48 overflow-auto space-y-1">
                          {channelLoading && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
                            </div>
                          )}
                          {channelRows.map((ch) => {
                            const code = ch.channelCode || "";
                            const checked = (it.channelCodes || []).includes(code);
                            const name = (ch.channelName || "").trim();
                            return (
                              <label key={ch.id} className="flex items-start gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  disabled={!code}
                                  checked={checked}
                                  onChange={(e) => toggleChannel(idx, code, e.target.checked, ch)}
                                />
                                <span className="break-all">
                                  <span className="font-medium text-slate-800">{name || "未命名通道"}</span>
                                  {code && <span className="ml-1 text-[10px] text-slate-400">#{code}</span>}
                                </span>
                                {ch.remarkCategoryName && (
                                  <span className="text-slate-400 shrink-0">[{ch.remarkCategoryName}]</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        {channelRows.length < channelTotal && (
                          <button
                            type="button"
                            className="text-xs text-blue-600"
                            onClick={() => void loadChannels(channelPage + 1, true)}
                          >
                            加载更多…
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="relative">
                    <div className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
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
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-slate-200 bg-white shadow-lg">
                        {personHits.map((raw, i) => {
                          const uid = String(raw.userid || raw.user_id || raw.id || "");
                          const name = raw.name || raw.username || uid;
                          return (
                            <button
                              key={uid || i}
                              type="button"
                              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                              onClick={() => addPerson(idx, raw)}
                            >
                              <span className="font-medium">{name}</span>
                              <span className="font-mono text-xs text-slate-500">{uid}</span>
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

            <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4">
              <AdminButton type="button" tone="secondary" onClick={closeEditor}>
                取消
              </AdminButton>
              <AdminButton type="button" tone="primary" disabled={saving} className="gap-2" onClick={() => void handleSave()}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                保存
              </AdminButton>
            </div>
          </div>
        </div>
      )}
    </div>
    </AdminPageShell>
  );
}
