import { useState } from "react";
import { Portal } from "@/components/Portal";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import {
  createDahuaDeviceChannelRemarkCategory,
  deleteDahuaDeviceChannelRemarkCategory,
  fetchDahuaDeviceChannelRemarkCategories,
  fetchDahuaDeviceChannels,
  patchDahuaDeviceChannelRemark,
  refreshDahuaDeviceChannels,
  updateDahuaDeviceChannelRemarkCategory,
  type DahuaDeviceChannelRemarkCategory,
  type DahuaDeviceChannelRow,
} from "@/api/twinApi";
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import DataSkeleton from "@/components/ui/DataSkeleton";

type RemarkFilterValue = "all" | "unset" | number;

const CAT_QUERY_KEY = ["dahuaDeviceChannelRemarkCategories"] as const;

export default function AdminDeviceChannelPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilterValue>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [newCatName, setNewCatName] = useState("");
  const [newCatSort, setNewCatSort] = useState(0);
  const [edits, setEdits] = useState<Record<number, { name: string; sortOrder: number }>>({});

  const { data: categories = [], isLoading: catLoading } = useQuery({
    queryKey: CAT_QUERY_KEY,
    queryFn: fetchDahuaDeviceChannelRemarkCategories,
  });

  const channelsQueryKey = ["dahuaDeviceChannels", { page, pageSize, keyword: appliedKeyword, remarkFilter }] as const;

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
      await updateDahuaDeviceChannelRemarkCategory(c.id, { name: e.name.trim(), sortOrder: e.sortOrder });
      toast.success("已保存");
      await qc.invalidateQueries({ queryKey: CAT_QUERY_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const handleDeleteCategory = async (c: DahuaDeviceChannelRemarkCategory) => {
    if (!window.confirm(`确定删除分类「${c.name}」？关联通道将变为未分类。`)) return;
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
      toast.error("请输入分类名称");
      return;
    }
    try {
      await createDahuaDeviceChannelRemarkCategory({ name, sortOrder: newCatSort });
      toast.success("已添加");
      setNewCatName("");
      setNewCatSort(0);
      await qc.invalidateQueries({ queryKey: CAT_QUERY_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加失败");
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--twin-ink)]">通道编码</h2>

      <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 space-y-3 shadow-twin-level-1">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
            关键字
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="通道名 / 通道编号 / 设备编号 / SN / ID"
              className="w-64 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]"
            onClick={() => {
              setAppliedKeyword(keyword);
              setPage(1);
            }}
          >
            查询
          </button>
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
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="border border-[var(--twin-hairline)] px-2 py-4 text-center text-[var(--twin-mute)]" colSpan={5}>
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
                <h3 className="text-base font-semibold text-[var(--twin-ink)]">备注分类配置</h3>
                <button type="button" className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm" onClick={() => setSettingsOpen(false)}>
                  关闭
                </button>
              </div>
              <p className="mb-3 text-xs text-[var(--twin-body)]">
                下列分类会出现在表格「备注」下拉里，用于给通道打标签，便于后续按分类筛选与二次封装选型。
              </p>
              <div className="space-y-2">
                {categories.map((c) => {
                  const e = getEdit(c);
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] p-2">
                      <input
                        className="min-w-[8rem] flex-1 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm"
                        value={e.name}
                        onChange={(ev) =>
                          setEdits((s) => ({
                            ...s,
                            [c.id]: { name: ev.target.value, sortOrder: e.sortOrder },
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
                            [c.id]: {
                              name: e.name,
                              sortOrder: Number(ev.target.value) || 0,
                            },
                          }))
                        }
                        title="排序，越小越靠前"
                      />
                      <button
                        type="button"
                        className="rounded-twin-sm bg-[var(--twin-primary)] px-2 py-1 text-xs font-medium text-[var(--twin-on-primary)]"
                        onClick={() => void handleSaveCategory(c)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="rounded-twin-sm border border-red-200 px-2 py-1 text-xs text-red-600"
                        onClick={() => void handleDeleteCategory(c)}
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 border-t border-[var(--twin-hairline)] pt-3">
                <div className="text-xs font-medium text-[var(--twin-body)]">新增分类</div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <input
                    className="min-w-[8rem] flex-1 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="分类名称"
                  />
                  <input
                    type="number"
                    className="w-20 rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm"
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
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
