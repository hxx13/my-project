import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import {
  fetchRoomMappingRooms,
  fetchRoomMappingFacets,
  patchRoomOfficialPermissionLevel,
  refreshRoomMappingFromClasspath,
  type RoomMappingRoomRow,
  type RoomMappingFacets,
} from "@/api/twinApi";
import { AdminFormCard, AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";

import { appConfirm } from "@/lib/appDialog";
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
        className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-xs font-mono"
        placeholder="未配置"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 3))}
        title="数字越小权限越高；留空表示未配置"
      />
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
          onClick={fillFromServer}
        >
          自动填入
        </button>
        <button
          type="button"
          className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
          onClick={() => setText("")}
        >
          清空
        </button>
        <button
          type="button"
          disabled={saving || !roomId}
          className="rounded-twin-sm bg-[var(--twin-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--twin-on-primary)] hover:opacity-90 disabled:opacity-40"
          onClick={() => void save()}
        >
          {saving ? "…" : "保存"}
        </button>
      </div>
    </div>
  );
}

const FACETS_KEY = ["roomMappingFacets"] as const;

export default function AdminRoomMappingPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [appliedRegion, setAppliedRegion] = useState("");
  const [appliedFloor, setAppliedFloor] = useState("");


  const { data: facets, isLoading: facetsLoading } = useQuery({
    queryKey: FACETS_KEY,
    queryFn: fetchRoomMappingFacets,
  });

  const roomsQueryKey = [
    "roomMappingRooms",
    { page, pageSize, keyword: appliedKeyword, region: appliedRegion, floor: appliedFloor },
  ] as const;

  const { data: roomData, isLoading } = useQuery({
    queryKey: roomsQueryKey,
    queryFn: () =>
      fetchRoomMappingRooms({
        page,
        pageSize,
        keyword: appliedKeyword.trim() || undefined,
        regionName: appliedRegion.trim() || undefined,
        floorName: appliedFloor.trim() || undefined,
        includeChannels: false,
      }),
    placeholderData: (prev) => prev,
  });

  const rows = roomData?.list || [];
  const total = roomData?.total || 0;

  const applyOfficialLevelPatch = useCallback(
    (targetRoomId: string, patch: OfficialLevelSavedPatch) => {
      qc.setQueryData(roomsQueryKey, (prev: typeof roomData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          list: (prev.list || []).map((row) =>
            row.roomId === targetRoomId
              ? {
                  ...row,
                  officialPermissionLevel: patch.officialPermissionLevel,
                  ...(patch.updatedAt != null && patch.updatedAt !== ""
                    ? { updatedAt: patch.updatedAt as string | number }
                    : {}),
                }
              : row
          ),
        };
      });
    },
    [qc, roomsQueryKey]
  );

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
    const ok = await appConfirm(
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
      await qc.invalidateQueries({ queryKey: FACETS_KEY });
      await qc.invalidateQueries({ queryKey: ["roomMappingRooms"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新失败");
    }
  };

  const regions = facets?.regions ?? [];
  const floorsForRegion = appliedRegion ? facets?.floorsByRegion?.[appliedRegion] ?? [] : [];

  return (
    <AdminPageShell>
    <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">
      <AdminFormCard title="筛选" className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="text-xs font-medium text-[var(--twin-mute)]">区域</div>
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => selectRegion("")}
            className={`rounded-full px-3 py-1 text-sm border ${
              appliedRegion === ""
                ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/10 text-[var(--twin-link-deep)]"
                : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
            }`}
          >
            全部
          </button>
          {facetsLoading && <span className="text-xs text-[var(--twin-mute)]">加载标签…</span>}
          {regions.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => selectRegion(r)}
              className={`rounded-full px-3 py-1 text-sm border ${
                appliedRegion === r
                  ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/10 text-[var(--twin-link-deep)]"
                  : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
              }`}
            >
              {r}
            </button>
          ))}
          </div>

        {appliedRegion && (
          <>
            <div className="text-xs font-medium text-[var(--twin-mute)] pt-1">楼层（{appliedRegion}）</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectFloor("")}
                className={`rounded-full px-3 py-1 text-sm border ${
                  appliedFloor === ""
                    ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/10 text-[var(--twin-link-deep)]"
                    : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
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
                    appliedFloor === f
                      ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/10 text-[var(--twin-link-deep)]"
                      : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </>
        )}
          <div className="flex flex-wrap items-end gap-2 pt-3 border-t border-[var(--twin-hairline)]">
            <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
              关键词（房间 id / 名称 / 区域 / 楼层）
              <input
                className="min-w-[12rem] rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 text-sm"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="回车或点查询"
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
              />
            </label>
            <button type="button" className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)]" onClick={applyFilters}>
              查询
            </button>
            <button
              type="button"
              className="rounded-twin-sm border border-amber-400/80 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
              onClick={() => void handleRefreshCsv()}
            >
              从 CSV 刷新
            </button>
          </div>
        </div>
      </AdminFormCard>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
      <AdminTableShell
        loading={isLoading}
        empty={!isLoading && rows.length === 0}
        emptyMessage="暂无数据。请先「从 CSV 刷新」导入，或调整筛选条件。"
        onRetry={() => qc.invalidateQueries({ queryKey: roomsQueryKey })}
      >
        <table>
          <thead>
            <tr className="sticky top-0 z-[2] bg-[var(--twin-canvas)]">
              <th className="border-b border-[var(--twin-hairline)] px-3 py-2 text-left font-medium">房间 id</th>
              <th className="border-b border-[var(--twin-hairline)] px-3 py-2 text-left font-medium">房间名称</th>
              <th className="border-b border-[var(--twin-hairline)] px-3 py-2 text-left font-medium">区域</th>
              <th className="border-b border-[var(--twin-hairline)] px-3 py-2 text-left font-medium">楼层</th>
              <th className="border-b border-[var(--twin-hairline)] px-3 py-2 text-left font-medium">官方权限等级</th>
              <th className="border-b border-[var(--twin-hairline)] px-3 py-2 text-left font-medium">更新</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.roomId ?? String(r.id)} className="hover:bg-[var(--twin-canvas-soft)]">
                <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top font-mono text-xs" title={r.roomId}>
                  {r.roomId || "—"}
                </td>
                <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top max-w-[14rem] truncate" title={r.roomName || ""}>
                  {r.roomName || "—"}
                </td>
                <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top max-w-[8rem] truncate">{r.regionName || "—"}</td>
                <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top max-w-[8rem] truncate">{r.floorName || "—"}</td>
                <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top text-xs text-[var(--twin-body)]">
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
                <td className="border-b border-[var(--twin-hairline)] px-3 py-2 align-top whitespace-nowrap text-xs text-[var(--twin-mute)]">
                  {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
        </div>
        <div className="shrink-0 pt-2 flex items-center justify-end gap-3 text-sm text-[var(--twin-body)]">
        <button
          type="button"
          className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40"
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
          className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1 disabled:opacity-40"
          disabled={page * pageSize >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          下一页
        </button>
      </div>
      </div>
      </div>
    </AdminPageShell>
  );
}
