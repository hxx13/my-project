import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { MapPin } from "lucide-react";
import {
  fetchRoomMappingRooms,
  fetchRoomMappingFacets,
  patchRoomOfficialPermissionLevel,
  refreshRoomMappingFromClasspath,
  type RoomMappingRoomRow,
  type RoomMappingFacets,
} from "@/api/twinApi";
import { AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";

/** 保存官方等级后合并进列表行；禁止在此处触发整表 load/整页重载（见 .cursor/rules/post-save-no-full-refresh.mdc） */
type OfficialLevelSavedPatch = Pick<RoomMappingRoomRow, "officialPermissionLevel"> & {
  updatedAt?: string | number | null;
};

function OfficialLevelEditor({
  roomId,
  serverLevel,
  onSaved,
}: {
  roomId: string;
  serverLevel: number | null | undefined;
  /** 保存成功后仅合并当前行，勿整表刷新 */
  onSaved: (patch: OfficialLevelSavedPatch) => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setText(serverLevel == null ? "" : String(serverLevel));
  }, [serverLevel, roomId]);

  const fillFromServer = () => {
    if (serverLevel == null || serverLevel === undefined) {
      toast.error("当前库内无官方等级，请手动输入；全员同步后可用「自动填入」");
      return;
    }
    setText(String(serverLevel));
    toast.success("已填入库内当前等级");
  };

  const save = async () => {
    const t = text.trim();
    let level: number | null = null;
    if (t !== "") {
      const n = Number(t);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 999) {
        toast.error("请输入 1～999 的整数，或留空表示未配置");
        return;
      }
      level = n;
    }
    setSaving(true);
    try {
      const updated = await patchRoomOfficialPermissionLevel(roomId, level);
      toast.success(level == null ? "已清空等级" : "已保存");
      const u = updated as RoomMappingRoomRow & { updatedAt?: string | number | null };
      onSaved({
        officialPermissionLevel: u.officialPermissionLevel ?? level,
        updatedAt: u.updatedAt,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[10.5rem]">
      <input
        type="text"
        inputMode="numeric"
        className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono"
        placeholder="未配置"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 3))}
        title="数字越小权限越高；留空表示未配置"
      />
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
          onClick={fillFromServer}
        >
          自动填入
        </button>
        <button
          type="button"
          className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
          onClick={() => setText("")}
        >
          清空
        </button>
        <button
          type="button"
          disabled={saving || !roomId}
          className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          onClick={() => void save()}
        >
          {saving ? "…" : "保存"}
        </button>
      </div>
    </div>
  );
}

export default function AdminRoomMappingPage() {
  /**
   * 列表数据：保存单字段后只合并对应行（见 OfficialLevelEditor / applyOfficialLevelPatch），
   * 不调用 load() 重拉整页——项目约束见 .cursor/rules/post-save-no-full-refresh.mdc
   */
  const [rows, setRows] = useState<RoomMappingRoomRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [appliedRegion, setAppliedRegion] = useState("");
  const [appliedFloor, setAppliedFloor] = useState("");
  const [loading, setLoading] = useState(false);
  const [facets, setFacets] = useState<RoomMappingFacets | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);

  const loadFacets = useCallback(async () => {
    setFacetsLoading(true);
    try {
      const data = await fetchRoomMappingFacets();
      setFacets(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载区域楼层失败");
    } finally {
      setFacetsLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchRoomMappingRooms({
        page,
        pageSize,
        keyword: appliedKeyword.trim(),
        regionName: appliedRegion.trim(),
        floorName: appliedFloor.trim(),
        includeChannels: false,
      });
      setRows(data.list || []);
      setTotal(data.total || 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载房间列表失败");
    } finally {
      setLoading(false);
    }
  }, [appliedFloor, appliedKeyword, appliedRegion, page, pageSize]);

  /** 保存后只更新当前行，禁止整表 load（项目约束 .cursor/rules/post-save-no-full-refresh.mdc） */
  const applyOfficialLevelPatch = useCallback((targetRoomId: string, patch: OfficialLevelSavedPatch) => {
    setRows((prev) =>
      prev.map((row) =>
        row.roomId === targetRoomId
          ? {
              ...row,
              officialPermissionLevel: patch.officialPermissionLevel,
              ...(patch.updatedAt != null && patch.updatedAt !== ""
                ? { updatedAt: patch.updatedAt as string | number }
                : {}),
            }
          : row
      )
    );
  }, []);

  useEffect(() => {
    void loadFacets();
  }, [loadFacets]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = () => {
    setAppliedKeyword(keyword);
    setPage(1);
  };

  const selectRegion = (region: string) => {
    setAppliedRegion(region);
    setAppliedFloor("");
    setPage(1);
  };

  const selectFloor = (floor: string) => {
    setAppliedFloor(floor);
    setPage(1);
  };

  const handleRefreshCsv = async () => {
    const ok = window.confirm(
      "将从 classpath 重新读取 src 内的 room_mapping.csv 并入库：\n" +
        "• 按「房间id」合并房间行；\n" +
        "• 若某行的「门禁通道编码」非空，将替换该房间下的全部通道；\n" +
        "• 若该列为空，则保留库内已有通道不变。\n\n确认继续？"
    );
    if (!ok) return;
    try {
      const stats = await refreshRoomMappingFromClasspath();
      toast.success(
        `导入完成：房间 ${stats.roomsUpserted} 行，跳过 ${stats.rowsSkipped} 行，读入 ${stats.rowsRead} 行；` +
          `通道写入 ${stats.channelRowsWritten} 条，替换通道的房间 ${stats.roomsChannelReplaced} 个`
      );
      await loadFacets();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新失败");
    }
  };

  const regions = facets?.regions ?? [];
  const floorsForRegion = appliedRegion ? facets?.floorsByRegion?.[appliedRegion] ?? [] : [];

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-6 w-6 text-blue-600" />
          ARO 房间
        </span>
      }
      description={
        <p className="max-w-3xl">
          仅展示 CSV 主数据（区域、楼层、房间等）。「官方权限等级」在 ARO 部分房间无返回时可在下表<strong>手动填写并保存</strong>；有同步值时可用「自动填入」恢复为当前库内等级。
          数字越小权限越高，用于扫码日轨迹与按钮锁定。通道与业务规则请在「通道编码」「门禁规则配置」中维护。数据来源为{" "}
          <code className="rounded bg-slate-100 px-1">src/main/resources/room_mapping.csv</code>，可通过「从 CSV 刷新」重新导入（不会覆盖你已手填的等级）。
        </p>
      }
    >

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs font-medium text-slate-500">区域</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => selectRegion("")}
            className={`rounded-full px-3 py-1 text-sm border ${
              appliedRegion === "" ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            全部
          </button>
          {facetsLoading && <span className="text-xs text-slate-400">加载标签…</span>}
          {regions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => selectRegion(r)}
              className={`rounded-full px-3 py-1 text-sm border ${
                appliedRegion === r ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {appliedRegion && (
          <>
            <div className="text-xs font-medium text-slate-500 pt-1">楼层（{appliedRegion}）</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectFloor("")}
                className={`rounded-full px-3 py-1 text-sm border ${
                  appliedFloor === "" ? "border-indigo-600 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                全部楼层
              </button>
              {floorsForRegion.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => selectFloor(f)}
                  className={`rounded-full px-3 py-1 text-sm border ${
                    appliedFloor === f ? "border-indigo-600 bg-indigo-50 text-indigo-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          关键词（房间 id / 名称 / 区域 / 楼层）
          <input
            className="min-w-[12rem] rounded border px-2 py-1.5 text-sm"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="回车或点查询"
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
        </label>
        <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={applyFilters}>
          查询
        </button>
        <button
          type="button"
          className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          onClick={() => void handleRefreshCsv()}
        >
          从 CSV 刷新
        </button>
      </div>

      <AdminTableShell
        loading={loading}
        empty={!loading && rows.length === 0}
        emptyMessage="暂无数据。请先「从 CSV 刷新」导入，或调整筛选条件。"
        onRetry={() => void load()}
        scrollable
      >
        <table>
          <thead>
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">房间 id</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">房间名称</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">区域</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">楼层</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">官方权限等级</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.roomId ?? String(r.id)} className="hover:bg-slate-50/80">
                <td className="border-b border-slate-100 px-3 py-2 align-top font-mono text-xs" title={r.roomId}>
                  {r.roomId || "—"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 align-top max-w-[14rem] truncate" title={r.roomName || ""}>
                  {r.roomName || "—"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 align-top max-w-[8rem] truncate">{r.regionName || "—"}</td>
                <td className="border-b border-slate-100 px-3 py-2 align-top max-w-[8rem] truncate">{r.floorName || "—"}</td>
                <td className="border-b border-slate-100 px-3 py-2 align-top text-xs text-slate-700">
                  {r.roomId ? (
                    <OfficialLevelEditor
                      roomId={r.roomId}
                      serverLevel={r.officialPermissionLevel}
                      onSaved={(patch) => applyOfficialLevelPatch(r.roomId, patch)}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 align-top whitespace-nowrap text-xs text-slate-500">
                  {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>

      <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
        <button
          type="button"
          className="rounded border px-3 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          上一页
        </button>
        <span>
          第 {page} 页 / 约 {Math.max(1, Math.ceil(total / pageSize))} 页，共 {total} 条
        </span>
        <button
          type="button"
          className="rounded border px-3 py-1 disabled:opacity-40"
          disabled={page * pageSize >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
    </AdminPageShell>
  );
}
