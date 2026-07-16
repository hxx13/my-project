import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Users, MapPin } from "lucide-react";
import {
  fetchSpecialStatusOverview,
  fetchSnapshotBatches,
  computeSpecialStatusStats,
  type SpecialStatusCage,
} from "@/api/domains/cageShelf.api";
import { STATUS_COLOR, STATUS_ABBR } from "@/features/cage-shelf/components/CageCellOverlays";
import { STATUS_LABEL_MAP } from "@/features/cage-shelf/components/SpecialStatusOverviewModal";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function uniqueCageCount(cages: SpecialStatusCage[]): number {
  return new Set(cages.map((c) => `${c.shelveId}|${c.positionX}|${c.positionY}`)).size;
}

function typeLabel(t: number) {
  return t === 1 ? "等待分配" : t === 2 ? "已预约(空笼盒)" : t === 3 ? "已预约(饲养中)" : t === 4 ? "异常" : "未知";
}

const STATS_LIST_MAX = 10;

/* ------------------------------------------------------------------ */
/*  Main Panel                                                         */
/* ------------------------------------------------------------------ */

export default function CageSpecialStatusReportPanel() {
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

  const stats = useMemo(() => (data ? computeSpecialStatusStats(data) : null), [data]);

  const [campusFilter, setCampusFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailCage, setDetailCage] = useState<SpecialStatusCage | null>(null);

  const toggleExpand = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const campusOptions = useMemo(() => {
    if (!stats) return [];
    return [...new Set(stats.allCages.map((c) => c.campusName).filter(Boolean))].sort();
  }, [stats]);

  const uniqueTotal = stats ? uniqueCageCount(stats.allCages) : 0;

  const filteredCages = useMemo(() => {
    if (!stats) return [];
    let list = stats.allCages;
    if (campusFilter) list = list.filter((c) => c.campusName === campusFilter);
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter((c) =>
        (c.roomName || "").toLowerCase().includes(q) ||
        (c.projectPiName || c.piName || "").toLowerCase().includes(q) ||
        (c.departmentName || "").toLowerCase().includes(q) ||
        (c.position || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [stats, campusFilter, searchText]);

  const groupsByCampus = useMemo(() => {
    if (!data) return [];
    const campusOrder = ["浦东", "浦西"];
    const result = campusOrder.map((cn) => ({ campusName: cn, groups: [] as typeof data.groups }));
    for (const cn of campusOrder) {
      const entry = result.find((r) => r.campusName === cn)!;
      entry.groups = data.groups
        .map((g) => ({
          ...g,
          cages: g.cages.filter(
            (c) => c.campusName === cn && filteredCages.some((fc) => fc.position === c.position && fc.shelveId === c.shelveId),
          ),
        }))
        .map((g) => ({ ...g, count: g.cages.length }))
        .filter((g) => g.cages.length > 0);
    }
    return result;
  }, [data, filteredCages]);

  if (isLoading) {
    return (
      <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-12 text-center text-sm text-[var(--twin-mute)]">
        加载特殊状态数据中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-twin-xl border border-red-200 bg-red-50/60 py-12 text-center text-sm text-red-700">
        {error instanceof Error ? error.message : "加载失败"}
        <br /><button type="button" className="mt-2 underline text-red-600" onClick={() => refetch()}>重试</button>
      </div>
    );
  }

  if (!stats || stats.allCages.length === 0) {
    return (
      <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] py-12 text-center text-sm text-[var(--twin-mute)]">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
        暂无特殊状态数据<br /><span className="text-[11px]">请先通过定时管理执行全量扫描</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---- Summary Cards ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="特殊状态总数"
          value={stats.totalAbnormal}
          subtitle={`涉及 ${uniqueTotal} 个笼位`}
          colorClass="bg-slate-100 border-slate-300 text-slate-700"
        />
        {stats.byStatus.map((s) => {
          const cc = STATUS_COLOR[s.code] ?? "bg-gray-400 ring-gray-200";
          return (
            <SummaryCard
              key={s.code}
              icon={<span className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${cc}`}><span className="text-white text-[7px] font-bold">{STATUS_ABBR[s.code] ?? "?"}</span></span>}
              label={STATUS_LABEL_MAP[s.code] ?? s.label}
              value={s.count}
              colorClass="border-[var(--twin-hairline)] bg-[var(--twin-canvas)]"
            />
          );
        })}
      </div>

      {/* ---- Campus stats: side by side ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {(["浦东", "浦西"] as const).map((campus) => {
          const campusRooms = stats.byRoom.filter((r) => r.campusName === campus);
          const campusGroups = stats.byGroup.filter((g) => g.campusName === campus);
          const campusTotal = campusRooms.reduce((s, r) => s + r.total, 0);
          if (campusTotal === 0) return null;
          return (
            <div key={campus} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
              <div className={`px-3 py-2 flex items-center gap-2 text-white text-xs font-bold ${campus === "浦东" ? "bg-gradient-to-r from-sky-500 to-blue-600" : "bg-gradient-to-r from-amber-400 to-orange-500"}`}>
                <MapPin className="h-3.5 w-3.5" /> {campus}校区 · {campusTotal} 状态标记 · {campusRooms.length} 房间 · {campusGroups.length} 课题组
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <MiniList icon={<Building2 className="h-3 w-3" />} title="按房间" items={campusRooms.map((r) => ({ label: r.roomName, count: r.total }))} />
                <MiniList icon={<Users className="h-3 w-3" />} title="按课题组" items={campusGroups.map((g) => ({ label: g.groupName, count: g.total }))} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Filter bar ---- */}
      <div className="flex flex-wrap items-center gap-3 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-2.5">
        <span className="text-xs font-medium text-[var(--twin-mute)]">筛选</span>
        <select className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs" value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)}>
          <option value="">全部校区</option>
          {campusOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-xs flex-1 min-w-[200px]" placeholder="搜索房间 / PI / 课题组 / 位置…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        <span className="text-[10px] text-[var(--twin-mute)]">显示 {uniqueCageCount(filteredCages)} 笼位 / {uniqueTotal} 总计</span>
        {/* 快照数据源选择器 */}
        {batchList.length > 0 && (
          <select
            className="rounded-twin-md border px-2 py-1 text-[11px] font-semibold transition bg-amber-100 border-amber-400 text-amber-900"
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

      {/* ---- Grouped Table: two campuses side by side ---- */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {groupsByCampus.map(({ campusName, groups }) => {
          if (groups.length === 0) return null;
          const campusTotal = groups.reduce((s, g) => s + g.cages.length, 0);
          return (
            <div key={campusName} className="space-y-2">
              <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm ${campusName === "浦东" ? "bg-gradient-to-r from-sky-500 to-blue-600" : "bg-gradient-to-r from-amber-400 to-orange-500"}`}>
                <MapPin className="h-3.5 w-3.5" /> {campusName}校区 · {campusTotal} 标记
              </div>
              {groups.map((group) => {
                const code = group.statusCode;
                const cc = STATUS_COLOR[code] ?? "bg-gray-400 ring-gray-200";
                const abbr = STATUS_ABBR[code] ?? "?";
                const label = STATUS_LABEL_MAP[code] ?? group.statusLabel;
                const key = `${campusName}-${code}`;
                const isOpen = expanded.has(key);
                return (
                  <div key={key} className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] overflow-hidden">
                    <button type="button" className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--twin-canvas-soft)] transition" onClick={() => toggleExpand(key)}>
                      <div className={`w-5 h-5 rounded-full ${cc} ring-2 flex items-center justify-center shadow-sm shrink-0`}><span className="text-white text-[9px] font-bold">{abbr}</span></div>
                      <span className="text-sm font-semibold text-[var(--twin-ink)]">{label}</span>
                      <span className="rounded-full bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-xs text-[var(--twin-body)]">{group.cages.length} 笼位</span>
                      <span className="ml-auto text-xs text-[var(--twin-mute)]">{isOpen ? "收起 ▲" : "展开 ▼"}</span>
                    </button>
                    {isOpen && group.cages.length > 0 && (
                      <div className="border-t border-[var(--twin-hairline)] overflow-auto max-h-[45vh]">
                        <table className="w-full text-xs">
                          <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] sticky top-0">
                            <tr>
                              <th className="px-2 py-1.5 text-left w-[60px]">位置</th>
                              <th className="px-2 py-1.5 text-left">房间</th>
                              <th className="px-2 py-1.5 text-left">PI</th>
                              <th className="px-2 py-1.5 text-left">部门</th>
                              <th className="px-2 py-1.5 text-center w-[52px]">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.cages.map((cage, idx) => (
                              <tr key={idx} className="border-t border-[var(--twin-hairline)] hover:bg-[var(--twin-canvas-soft)]">
                                <td className="px-2 py-1 font-mono">{cage.position}</td>
                                <td className="px-2 py-1">{cage.roomName || "-"}</td>
                                <td className="px-2 py-1">{cage.projectPiName || cage.piName || "-"}</td>
                                <td className="px-2 py-1 max-w-[140px] truncate">{cage.departmentName || "-"}</td>
                                <td className="px-2 py-1 text-center">
                                  <button type="button" className="text-[11px] font-medium text-[var(--twin-link-deep)] hover:underline whitespace-nowrap" onClick={() => setDetailCage(cage)}>详情</button>
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
          );
        })}
      </div>

      {/* ---- Detail Popup ---- */}
      {detailCage && <CageDetailPopup cage={detailCage} onClose={() => setDetailCage(null)} />}

      <div className="text-[10px] text-[var(--twin-mute)] text-right">
        数据来源: 最近一次扫描 ({stats.scannedAt || "未知"}) · 一个笼位可同时拥有多个状态
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail Popup (matches cell-click detail in cage shelf page)         */
/* ------------------------------------------------------------------ */

function CageDetailPopup({ cage, onClose }: { cage: SpecialStatusCage; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-3 flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--twin-hairline)] shrink-0">
          <div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {cage.position}</div>
          <button type="button" className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={onClose}><span className="text-lg leading-none">&times;</span></button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <DetailField label="位置" value={cage.position} />
            <DetailField label="校区" value={cage.campusName} />
            <DetailField label="房间" value={cage.roomName} />
            <DetailField label="笼架ID" value={cage.shelveId} />
            <DetailField label="X 坐标" value={String(cage.positionX)} />
            <DetailField label="Y 坐标" value={String(cage.positionY)} />
            <DetailField label="课题 PI" value={cage.projectPiName || cage.piName} />
            <DetailField label="部门" value={cage.departmentName} />
            <DetailField label="笼盒卡号" value={cage.cageBoxQrCode} mono />
            <DetailField label="笼位类型" value={typeLabel(cage.animalCageType)} />
            <DetailField label="动物转移" value={cage.detailName} />
            <DetailField label="详情说明" value={cage.detailDescription} fullWidth />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DetailField({ label, value, mono, fullWidth }: { label: string; value?: string | null; mono?: boolean; fullWidth?: boolean }) {
  const display = value || "-";
  return (
    <div className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${fullWidth ? "col-span-2" : ""}`}>
      <div className="text-[var(--twin-mute)]">{label}</div>
      <div className={`mt-0.5 break-all text-[var(--twin-ink)] ${mono ? "font-mono text-[11px]" : ""}`}>{display}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SummaryCard({ icon, label, value, subtitle, colorClass }: {
  icon: React.ReactNode; label: string; value: number; subtitle?: string; colorClass: string;
}) {
  return (
    <div className={`rounded-twin-lg border px-3 py-2.5 ${colorClass}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-[var(--twin-mute)] mb-1">{icon}{label}</div>
      <div className="text-xl font-bold text-[var(--twin-ink)]">{value}</div>
      {subtitle && <div className="text-[10px] text-[var(--twin-mute)] mt-0.5">{subtitle}</div>}
    </div>
  );
}

function MiniList({ icon, title, items }: { icon: React.ReactNode; title: string; items: { label: string; count: number }[] }) {
  const needsScroll = items.length > STATS_LIST_MAX;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-[11px] font-semibold text-[var(--twin-mute)]">{icon}{title} ({items.length})</div>
      <div className={`space-y-0.5 ${needsScroll ? "max-h-[220px] overflow-y-auto pr-1" : ""}`}>
        {items.length === 0
          ? <div className="text-[10px] text-[var(--twin-mute)]">暂无</div>
          : items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--twin-body)] truncate mr-2">{item.label}</span>
                <span className="font-semibold text-[var(--twin-ink)] shrink-0">{item.count}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}
