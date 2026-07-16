import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, X } from "lucide-react";
import { Portal } from "@/components/Portal";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  fetchSpecialStatusOverview,
  fetchSnapshotBatches,
  type SpecialStatusCage,
  type SpecialStatusGroup,
} from "@/api/domains/cageShelf.api";
import { STATUS_COLOR, STATUS_ABBR } from "@/features/cage-shelf/components/CageCellOverlays";

const STATUS_LABEL_MAP: Record<string, string> = {
  COHABITATION: "合笼/繁殖",
  SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标",
  HEALTH_ABNORMAL: "动物健康异常",
  ANIMAL_TRANSFER: "动物转移",
};

/** Merged cage: unique per (shelveId, positionX, positionY) with all statuses */
interface MergedCage {
  key: string;
  shelveId: string;
  campusName: string;
  roomName: string;
  position: string;
  positionX: number;
  positionY: number;
  piName: string;
  departmentName: string;
  projectPiName: string;
  cageBoxQrCode: string;
  animalCageType: number;
  statuses: { code: string; label: string; detailName: string; detailDescription: string }[];
}

function mergeCages(cages: SpecialStatusCage[], group: SpecialStatusGroup): MergedCage[] {
  const map = new Map<string, MergedCage>();
  for (const c of cages) {
    const key = `${c.shelveId}-${c.positionX}-${c.positionY}`;
    const existing = map.get(key);
    if (existing) {
      existing.statuses.push({
        code: group.statusCode,
        label: group.statusLabel,
        detailName: c.detailName || "",
        detailDescription: c.detailDescription || "",
      });
    } else {
      map.set(key, {
        key,
        shelveId: c.shelveId,
        campusName: c.campusName || "",
        roomName: c.roomName,
        position: c.position,
        positionX: c.positionX,
        positionY: c.positionY,
        piName: c.piName || "",
        departmentName: c.departmentName || "",
        projectPiName: c.projectPiName || "",
        cageBoxQrCode: c.cageBoxQrCode || "",
        animalCageType: c.animalCageType || 0,
        statuses: [{
          code: group.statusCode,
          label: group.statusLabel,
          detailName: c.detailName || "",
          detailDescription: c.detailDescription || "",
        }],
      });
    }
  }
  return Array.from(map.values());
}

/** Deduplicate across all groups — merge same cage appearing in multiple status groups */
function deduplicateCages(allCages: MergedCage[]): MergedCage[] {
  const map = new Map<string, MergedCage>();
  for (const c of allCages) {
    const existing = map.get(c.key);
    if (existing) {
      // Merge statuses
      for (const s of c.statuses) {
        if (!existing.statuses.some((es) => es.code === s.code)) {
          existing.statuses.push(s);
        }
      }
    } else {
      map.set(c.key, { ...c, statuses: [...c.statuses] });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.roomName.localeCompare(b.roomName) || a.positionY - b.positionY || a.positionX - b.positionX
  );
}

/* ---- Detail Popup ---- */

function CageDetailPopup({ cage, onClose }: { cage: MergedCage; onClose: () => void }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
        <div className="w-full max-w-2xl rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-3 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--twin-hairline)] shrink-0">
            <div className="text-sm font-semibold text-[var(--twin-ink)]">
              笼位详情 · {cage.position}
            </div>
            <button type="button" className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-3 text-sm">
            {/* Status badges */}
            <div className="flex flex-wrap gap-1.5">
              {cage.statuses.map((s) => {
                const colorClass = STATUS_COLOR[s.code] ?? "bg-gray-400 ring-gray-200";
                const abbr = STATUS_ABBR[s.code] ?? "?";
                return (
                  <span key={s.code} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${colorClass}`}>
                    <span className={`w-3.5 h-3.5 rounded-full bg-white/30 flex items-center justify-center text-[7px] font-bold`}>{abbr}</span>
                    {s.label}
                  </span>
                );
              })}
            </div>

            <DetailRow label="位置" value={cage.position} />
            <DetailRow label="校区" value={cage.campusName} />
            <DetailRow label="房间" value={cage.roomName} />
            <DetailRow label="PI" value={cage.projectPiName || cage.piName} />
            <DetailRow label="部门" value={cage.departmentName} />
            <DetailRow label="笼盒卡号" value={cage.cageBoxQrCode} mono />
            <DetailRow label="笼位类型" value={cageTypeLabel(cage.animalCageType)} />

            {/* Special breeding details */}
            {cage.statuses.some(s => s.detailName || s.detailDescription) && (
              <>
                <div className="text-xs font-medium text-[var(--twin-ink)] pt-1 border-t border-[var(--twin-hairline)]">特殊饲养详情</div>
                {cage.statuses.filter(s => s.detailName || s.detailDescription).map((s, i) => (
                  <div key={i} className="rounded-twin-sm border border-[var(--twin-hairline)] p-2 text-xs">
                    {s.detailName && <DetailRow label="名称" value={s.detailName} />}
                    {s.detailDescription && <DetailRow label="说明" value={s.detailDescription} />}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value || value === "-") return null;
  return (
    <div className="flex gap-2 items-start">
      <span className="text-[var(--twin-mute)] w-20 shrink-0 text-xs pt-0.5">{label}</span>
      <span className={`text-[var(--twin-ink)] break-all whitespace-pre-wrap min-w-0 flex-1 ${mono ? "font-mono text-xs" : ""}`}>{value || "-"}</span>
    </div>
  );
}

function cageTypeLabel(t: number) {
  return t === 1 ? "等待分配" : t === 2 ? "已预约(空笼盒)" : t === 3 ? "已预约(饲养中)" : t === 4 ? "异常" : "未知";
}

/* ---- Main Page ---- */

export default function AdminSpecialStatusOverviewPage() {
  const navigate = useNavigate();
  const [detailCage, setDetailCage] = useState<MergedCage | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 快照批次选择
  const { data: batchList = [] } = useQuery({
    queryKey: ["snapshotBatches"],
    queryFn: fetchSnapshotBatches,
    staleTime: 60_000,
  });
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");

  // 自动选择最新快照
  useEffect(() => {
    if (!selectedBatchId && batchList.length > 0) {
      setSelectedBatchId(batchList[0].scanBatchId);
    }
  }, [batchList, selectedBatchId]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["specialStatusOverview", selectedBatchId],
    queryFn: () => fetchSpecialStatusOverview(selectedBatchId || undefined),
    refetchInterval: 120_000,
    enabled: !!selectedBatchId,
  });

  // Merge and deduplicate
  const allMerged = useMemo(() => {
    if (!data?.groups) return [];
    const all: MergedCage[] = [];
    for (const g of data.groups) {
      all.push(...mergeCages(g.cages, g));
    }
    return deduplicateCages(all);
  }, [data]);

  // Group by status for the grouped view
  const groupedByStatus = useMemo(() => {
    if (!data?.groups) return [];
    return data.groups.map((g) => ({
      ...g,
      merged: mergeCages(g.cages, g),
    }));
  }, [data]);

  const toggleExpand = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <AdminPageShell>
      <div className="space-y-4">
        {/* Meta bar */}
        {data && (
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-3 text-sm flex flex-wrap items-center gap-3">
            <span className="text-[var(--twin-body)]">
              上次扫描: <span className="font-semibold text-[var(--twin-ink)]">{data.scannedAt || "未知"}</span>
              <span className="mx-2">·</span>
              特殊状态标记合计: <span className="font-semibold text-[var(--twin-ink)]">{data.totalAbnormal}</span>
              <span className="mx-2">·</span>
              去重后笼位: <span className="font-semibold text-[var(--twin-ink)]">{allMerged.length}</span>
            </span>
            {/* 快照数据源选择器 */}
            {batchList.length > 0 && (
              <select
                className={`rounded-twin-md border px-2 py-1 text-[11px] font-semibold transition ml-auto ${selectedBatchId ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-[var(--twin-canvas)] border-[var(--twin-hairline)] text-[var(--twin-ink)]'}`}
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
              >
                {batchList.map((b) => (
                  <option key={b.scanBatchId} value={b.scanBatchId}>
                    {b.scannedAt?.substring(0, 16)?.replace("T", " ")} · {b.abnormalRows}异常/{b.shelfCount}架
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {isLoading && <div className="text-center text-sm text-[var(--twin-mute)] py-12">加载中…</div>}

        {error && <div className="text-center text-sm text-red-600 py-12">{error instanceof Error ? error.message : "加载失败"}</div>}

        {!isLoading && !error && data && allMerged.length === 0 && (
          <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-12 text-center text-sm text-[var(--twin-mute)]">
            暂无特殊状态笼位数据。请先通过「定时管理」执行「全量笼位数据同步」。
          </div>
        )}

        {/* Grouped by status */}
        {groupedByStatus.map((group) => {
          const code = group.statusCode;
          const colorClass = STATUS_COLOR[code] ?? "bg-gray-400 ring-gray-200";
          const abbr = STATUS_ABBR[code] ?? "?";
          const label = STATUS_LABEL_MAP[code] ?? group.statusLabel;
          const isOpen = expanded.has(code);

          return (
            <div key={code} className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--twin-canvas-soft)] transition"
                onClick={() => toggleExpand(code)}
              >
                <div className={`w-6 h-6 rounded-full ${colorClass} ring-2 flex items-center justify-center shadow-sm shrink-0`}>
                  <span className="text-white text-[10px] font-bold leading-none">{abbr}</span>
                </div>
                <span className="text-base font-semibold text-[var(--twin-ink)]">{label}</span>
                <span className="rounded-full bg-[var(--twin-canvas-soft)] px-2.5 py-0.5 text-sm text-[var(--twin-body)] font-medium">
                  {group.merged.length} 个笼位
                </span>
                <span className="ml-auto text-xs text-[var(--twin-mute)]">{isOpen ? "收起 ▲" : "展开 ▼"}</span>
              </button>

              {isOpen && group.merged.length > 0 && (
                <div className="border-t border-[var(--twin-hairline)] overflow-auto max-h-[50vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-[80px]">位置</th>
                        <th className="px-3 py-2 text-left">校区</th>
                        <th className="px-3 py-2 text-left">房间</th>
                        <th className="px-3 py-2 text-left">PI</th>
                        <th className="px-3 py-2 text-left">部门</th>
                        <th className="px-3 py-2 text-left w-[80px]">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.merged.map((cage) => (
                        <tr key={cage.key} className="border-t border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)]">
                          <td className="px-3 py-1.5 font-mono">{cage.position}</td>
                          <td className="px-3 py-1.5">{cage.campusName || "-"}</td>
                          <td className="px-3 py-1.5">{cage.roomName || "-"}</td>
                          <td className="px-3 py-1.5">{cage.projectPiName || cage.piName || "-"}</td>
                          <td className="px-3 py-1.5 max-w-[200px] truncate">{cage.departmentName || "-"}</td>
                          <td className="px-3 py-1.5">
                            <button
                              type="button"
                              className="text-[var(--twin-link-deep)] hover:underline text-xs"
                              onClick={() => setDetailCage(cage)}
                            >
                              详情
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {detailCage && <CageDetailPopup cage={detailCage} onClose={() => setDetailCage(null)} />}
    </AdminPageShell>
  );
}
