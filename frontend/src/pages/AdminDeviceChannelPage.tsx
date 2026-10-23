import { useMemo, useState } from "react";
import { Portal } from "@/components/Portal";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Settings2 } from "lucide-react";
import {
  createDahuaDeviceChannelRemarkCategory,
  deleteDahuaDeviceChannelRemarkCategory,
  fetchDahuaDeviceChannelRemarkCategories,
  fetchDahuaDeviceChannels,
  patchDahuaDeviceChannelRemark,
  refreshDahuaDeviceChannels,
  renameDahuaChannel,
  seedDahuaDoorCategories,
  updateDahuaDeviceChannelRemarkCategory,
  type DahuaDeviceChannelRemarkCategory,
  type DahuaDeviceChannelRow,
} from "@/api/twinApi";
import { AdminDataTableWrap, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import DataSkeleton from "@/components/ui/DataSkeleton";

import { appConfirm, appPrompt } from "@/lib/appDialog";
type RemarkFilterValue = "all" | "unset" | number;

const CAT_QUERY_KEY = ["dahuaDeviceChannelRemarkCategories"] as const;

export default function AdminDeviceChannelPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilterValue>("all");
  const [unitFilter, setUnitFilter] = useState<"" | "1" | "7">("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [newCatName, setNewCatName] = useState("");
  const [newCatSort, setNewCatSort] = useState(0);
  const [newCatParentId, setNewCatParentId] = useState<number | "">("");
  const [edits, setEdits] = useState<Record<number, { name: string; sortOrder: number }>>({});

  const { data: categories = [], isLoading: catLoading } = useQuery({
    queryKey: CAT_QUERY_KEY,
    queryFn: fetchDahuaDeviceChannelRemarkCategories,
  });

  const catById = useMemo(
    () => new Map(categories.map((c) => [Number(c.id), c])),
    [categories]
  );

  /** 分类树按父→子展开；孤儿节点落到根层 */
  const orderedCats = useMemo(() => {
    const children = new Map<number, DahuaDeviceChannelRemarkCategory[]>();
    for (const c of categories) {
      const pid = c.parentId != null && catById.has(Number(c.parentId)) ? Number(c.parentId) : 0;
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid)!.push(c);
    }
    for (const list of children.values()) {
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || Number(a.id) - Number(b.id));
    }
    const out: Array<{ cat: DahuaDeviceChannelRemarkCategory; depth: number; path: string }> = [];
    const walk = (pid: number, depth: number, prefix: string) => {
      for (const cat of children.get(pid) || []) {
        const path = prefix ? `${prefix} / ${cat.name}` : cat.name;
        out.push({ cat, depth, path });
        walk(Number(cat.id), depth + 1, path);
      }
    };
    walk(0, 0, "");
    return out;
  }, [categories, catById]);

  const pathOf = (c: DahuaDeviceChannelRemarkCategory) =>
    orderedCats.find((x) => x.cat.id === c.id)?.path || c.name;

  const channelsQueryKey = ["dahuaDeviceChannels", { page, pageSize, keyword: appliedKeyword, remarkFilter, unitFilter }] as const;

  const { data: channelData, isLoading } = useQuery({
    queryKey: channelsQueryKey,
    queryFn: () => {
      const opts: Parameters<typeof fetchDahuaDeviceChannels>[0] = {
        page,
        pageSize,
        keyword: appliedKeyword.trim() || undefined,
      };
      if (remarkFilter === "unset") opts.unassignedOnly = true;
      else if (remarkFilter !== "all" && typeof remarkFilter === "number") opts.remarkCategoryId = remarkFilter;
      if (unitFilter) opts.unitType = Number(unitFilter);
      return fetchDahuaDeviceChannels(opts);
    },
    placeholderData: (prev) => prev,
  });

  const rows = channelData?.list || [];
  const total = channelData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const getEdit = (c: DahuaDeviceChannelRemarkCategory) =>
    edits[c.id] ?? { name: c.name, sortOrder: c.sortOrder ?? 0 };

  const handleSaveCategory = async (c: DahuaDeviceChannelRemarkCategory) => {
    const e = getEdit(c);
    try {
      await updateDahuaDeviceChannelRemarkCategory(c.id, {
        name: e.name.trim(),
        sortOrder: e.sortOrder,
        parentId: c.parentId ?? null,
      });
      toast.success("已保存");
      await qc.invalidateQueries({ queryKey: CAT_QUERY_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const handleDeleteCategory = async (c: DahuaDeviceChannelRemarkCategory) => {
    const children = categories.filter((x) => Number(x.parentId) === Number(c.id)).length;
    if (!await appConfirm(
      children > 0
        ? `确定删除文件夹「${c.name}」？其下 ${children} 个子文件夹和通道会移到上一级。`
        : `确定删除文件夹「${c.name}」？关联通道会变为未分类。`
    )) return;
    try {
      await deleteDahuaDeviceChannelRemarkCategory(c.id);
      toast.success("已删除");
      await qc.invalidateQueries({ queryKey: CAT_QUERY_KEY });
      if (remarkFilter === c.id) {
        setRemarkFilter("all");
        setPage(1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) {
      toast.error("请输入文件夹名称");
      return;
    }
    try {
      await createDahuaDeviceChannelRemarkCategory({
        name,
        sortOrder: newCatSort,
        parentId: newCatParentId === "" ? null : Number(newCatParentId),
      });
      toast.success("已添加");
      setNewCatName("");
      setNewCatSort(0);
      await qc.invalidateQueries({ queryKey: CAT_QUERY_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加失败");
    }
  };

  const handleSeedFromDahua = async () => {
    try {
      const stats = await seedDahuaDoorCategories();
      if (stats.floors == null) {
        toast.error("后端还没加载新版楼层预置逻辑，请重启后端后再试");
        return;
      }
      toast.success(
        `已按平台楼层预置：${stats.assigned ?? 0} 个通道归入 ${stats.floors ?? 0} 个楼层文件夹`
      );
      await qc.invalidateQueries({ queryKey: CAT_QUERY_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "预置失败");
    }
  };

  const handleRemarkChange = async (row: DahuaDeviceChannelRow, value: string) => {
    const rid = value === "" ? null : Number(value);
    try {
      await patchDahuaDeviceChannelRemark(row.id, rid);
      const cat = rid == null ? undefined : categories.find((c) => c.id === rid);
      qc.setQueryData(channelsQueryKey, (prev: typeof channelData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          list: (prev.list || []).map((r) =>
            r.id === row.id
              ? { ...r, remarkCategoryId: rid ?? undefined, remarkCategoryName: cat?.name }
              : r
          ),
        };
      });
      toast.success("备注已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const handleRenameChannel = async (row: DahuaDeviceChannelRow) => {
    const code = String(row.channelCode || "").trim();
    if (!code) return;
    const next = await appPrompt("修改通道名称", row.channelName || "", { title: "修改通道名称" });
    if (next == null) return;
    const name = next.trim();
    if (!name || name === row.channelName) return;
    if (name.length > 60) {
      toast.error("通道名称不能超过 60 个字符");
      return;
    }
    try {
      await renameDahuaChannel({ channelCode: code, channelName: name });
      toast.success("通道名称已更新");
      qc.setQueryData(channelsQueryKey, (prev: typeof channelData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          list: (prev.list || []).map((r) => (r.id === row.id ? { ...r, channelName: name } : r)),
        };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "改名失败");
    }
  };

  return (
    <AdminPageShell>
      <div className="max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px] overflow-y-auto">
        <div className="space-y-4">

      <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-3 shadow-twin-level-1">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
            关键字
            <AdminToolbarSearchField
              className="w-64"
              placeholder="通道名 / 通道编号 / 设备编号 / SN / ID"
              value={keyword}
              onChange={setKeyword}
              onSubmit={() => {
                setAppliedKeyword(keyword);
                setPage(1);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
            备注分类
            <select
              value={
                remarkFilter === "all" ? "" : remarkFilter === "unset" ? "unset" : String(remarkFilter)
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") setRemarkFilter("all");
                else if (v === "unset") setRemarkFilter("unset");
                else setRemarkFilter(Number(v));
                setPage(1);
              }}
              className="min-w-[10rem] rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
            >
              <option value="">全部</option>
              <option value="unset">未分类</option>
              {orderedCats.map(({ cat, depth }) => (
                <option key={cat.id} value={cat.id}>
                  {"　".repeat(Math.min(depth, 6))}{cat.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
            通道类型
            <select
              value={unitFilter}
              onChange={(e) => {
                setUnitFilter(e.target.value as "" | "1" | "7");
                setPage(1);
              }}
              className="min-w-[8rem] rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
            >
              <option value="">全部</option>
              <option value="1">视频通道</option>
              <option value="7">门禁通道</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]"
            onClick={async () => {
              try {
                await refreshDahuaDeviceChannels();
                toast.success("通道缓存已刷新");
                await qc.invalidateQueries({ queryKey: ["dahuaDeviceChannels"] });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "刷新失败");
              }
            }}
          >
            同步大华
          </button>
          <button
            type="button"
            title="配置备注分类（下拉选项）"
            className="inline-flex h-9 w-9 items-center justify-center rounded-twin-sm border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <DataSkeleton variant="table" rows={6} />
        ) : (
          <AdminDataTableWrap scrollable>
            <table className="min-w-full border border-[var(--twin-hairline)] text-sm">
              <thead className="bg-[var(--twin-canvas-soft)]">
                <tr>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">ID</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">channelCode</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">名称</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left">deviceCode</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-left min-w-[12rem]">备注（分类）</th>
                  <th className="border border-[var(--twin-hairline)] px-2 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2 whitespace-nowrap">{r.id}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.channelCode || "-"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2 max-w-[16rem] truncate" title={r.channelName}>
                      {r.channelName || "-"}
                    </td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">{r.deviceCode || "-"}</td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2">
                      <select
                        className="w-full max-w-xs rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm"
                        value={r.remarkCategoryId != null ? String(r.remarkCategoryId) : ""}
                        onChange={(e) => void handleRemarkChange(r, e.target.value)}
                      >
                        <option value="">未分类</option>
                        {orderedCats.map(({ cat, depth }) => (
                          <option key={cat.id} value={cat.id}>
                            {"　".repeat(Math.min(depth, 6))}{cat.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-[var(--twin-hairline)] px-2 py-2 text-right">
                      <button
                        type="button"
                        title="修改通道名称"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--twin-hairline)] text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                        onClick={() => void handleRenameChannel(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="border border-[var(--twin-hairline)] px-2 py-4 text-center text-[var(--twin-mute)]" colSpan={6}>
                      暂无数据，可先点「同步大华」，并在齿轮中配置备注分类
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminDataTableWrap>
        )}

        <div className="flex items-center justify-end gap-3 text-sm">
          <button
            type="button"
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className="text-[var(--twin-body)]">
            第 {page} / {totalPages} 页（本页 {rows.length}，总数 {total}）
          </span>
          <button
            type="button"
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      </div>

      {settingsOpen && (
        <Portal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-twin-lg bg-[var(--twin-canvas)] p-4 shadow-twin-level-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">文件夹管理</h3>
                <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm" onClick={() => setSettingsOpen(false)}>
                  关闭
                </button>
              </div>
              <p className="mb-3 text-xs text-[var(--twin-body)]">
                文件夹支持多层嵌套：楼层文件夹里可以继续建子文件夹。表格与筛选下拉按层级缩进显示。
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-twin-sm bg-[var(--twin-canvas-soft)] p-2">
                <button
                  type="button"
                  className="rounded-twin-sm bg-[var(--twin-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--twin-on-primary)]"
                  onClick={() => void handleSeedFromDahua()}
                >
                  按平台楼层预置
                </button>
                <span className="text-[11px] text-[var(--twin-mute)]">
                  按平台楼层生成一级文件夹，只给未分类通道归类；门组不参与通道分类
                </span>
              </div>
              <div className="space-y-1">
                {orderedCats.map(({ cat, depth, path }) => {
                  const e = getEdit(cat);
                  return (
                    <div
                      key={cat.id}
                      className="flex flex-wrap items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] p-2"
                      style={{ marginLeft: Math.min(depth, 6) * 14 }}
                    >
                      <span className="max-w-[9rem] shrink-0 truncate text-[11px] text-[var(--twin-mute)]" title={path}>
                        {cat.name}
                      </span>
                      <input
                        className="min-w-[8rem] flex-1 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm"
                        value={e.name}
                        onChange={(ev) =>
                          setEdits((s) => ({
                            ...s,
                            [cat.id]: { name: ev.target.value, sortOrder: e.sortOrder },
                          }))
                        }
                        placeholder="名称"
                      />
                      <input
                        type="number"
                        className="w-20 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm"
                        value={e.sortOrder}
                        onChange={(ev) =>
                          setEdits((s) => ({
                            ...s,
                            [cat.id]: { name: e.name, sortOrder: Number(ev.target.value) || 0 },
                          }))
                        }
                        title="排序，越小越靠前"
                      />
                      <button
                        type="button"
                        className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs text-[var(--twin-body)]"
                        onClick={() => {
                          setNewCatParentId(Number(cat.id));
                          setNewCatName("");
                        }}
                      >
                        子文件夹
                      </button>
                      <button
                        type="button"
                        className="rounded-twin-sm bg-[var(--twin-primary)] px-2 py-1 text-xs font-medium text-[var(--twin-on-primary)]"
                        onClick={() => void handleSaveCategory(cat)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="rounded-twin-sm border border-red-200 px-2 py-1 text-xs text-red-600"
                        onClick={() => void handleDeleteCategory(cat)}
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
                {orderedCats.length === 0 && (
                  <div className="p-3 text-center text-xs text-[var(--twin-mute)]">还没有文件夹</div>
                )}
              </div>
              <div className="mt-4 border-t border-[var(--twin-hairline)] pt-3">
                <div className="text-xs font-medium text-[var(--twin-body)]">新增文件夹</div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <select
                    className="w-44 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
                    value={newCatParentId}
                    onChange={(e) => setNewCatParentId(e.target.value === "" ? "" : Number(e.target.value))}
                    title="父文件夹"
                  >
                    <option value="">根层</option>
                    {orderedCats.map(({ cat, depth }) => (
                      <option key={cat.id} value={cat.id}>
                        {"　".repeat(Math.min(depth, 6))}{cat.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="min-w-[8rem] flex-1 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="文件夹名称"
                  />
                  <input
                    type="number"
                    className="w-20 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
                    value={newCatSort}
                    onChange={(e) => setNewCatSort(Number(e.target.value) || 0)}
                    title="排序"
                  />
                  <button
                    type="button"
                    className="rounded-twin-sm bg-[var(--twin-ink)] px-3 py-1.5 text-sm font-medium text-[var(--twin-canvas)]"
                    onClick={() => void handleAddCategory()}
                  >
                    添加
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-[var(--twin-mute)]">
                  父级：
                  {newCatParentId === ""
                    ? "根层"
                    : (() => {
                        const parent = catById.get(Number(newCatParentId));
                        return parent ? pathOf(parent) : "-";
                      })()}
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
        </div>
      </div>
    </AdminPageShell>
  );
}
