import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";
import {
  fetchSpecialStatusOverview,
  type SpecialStatusOverview,
  type SpecialStatusGroup,
} from "@/api/domains/cageShelf.api";
import { STATUS_COLOR, STATUS_ABBR } from "./CageCellOverlays";

export const STATUS_LABEL_MAP: Record<string, string> = {
  COHABITATION: "合笼/繁殖",
  SPECIAL_FEEDING: "特殊饲养",
  NEED_DIVIDE: "请分笼/密度超标",
  HEALTH_ABNORMAL: "动物健康异常",
  ANIMAL_TRANSFER: "动物转移",
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** Override API function (student endpoint with visibility filtering) */
  apiFn?: () => Promise<SpecialStatusOverview>;
  /** Visual context — affects header text */
  variant?: "admin" | "student";
}

export default function SpecialStatusOverviewModal({ open, onClose, apiFn, variant = "admin" }: Props) {
  const [data, setData] = useState<SpecialStatusOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const fn = apiFn ?? fetchSpecialStatusOverview;
        const result = await fn();
        if (cancelled) return;
        setData(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, apiFn]);

  const toggleExpand = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  if (!open) return null;

  const isStudent = variant === "student";

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-5xl max-h-[85vh] rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-3 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--twin-hairline)] shrink-0">
          <div>
            <div className="text-base font-semibold text-[var(--twin-ink)]">
              特殊状态总览{isStudent ? "（本课题组）" : ""}
            </div>
            {data?.scannedAt && (
              <div className="text-[11px] text-[var(--twin-mute)] mt-0.5">
                上次扫描: {data.scannedAt} · 共 {data.totalAbnormal} 个特殊状态笼位
              </div>
            )}
          </div>
          <button
            type="button"
            className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] transition"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {loading && (
            <div className="text-center text-sm text-[var(--twin-mute)] py-8">加载中…</div>
          )}
          {error && (
            <div className="text-center text-sm text-red-600 py-8">{error}</div>
          )}
          {!loading && !error && data && data.groups.length === 0 && (
            <div className="text-center text-sm text-[var(--twin-mute)] py-8">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              暂无特殊状态笼位数据
              <br />
              <span className="text-[11px]">请先通过定时管理页面执行全量扫描</span>
            </div>
          )}
          {!loading &&
            !error &&
            data?.groups.map((group) => (
              <StatusGroupBlock
                key={group.statusCode}
                group={group}
                expanded={expanded.has(group.statusCode)}
                onToggle={() => toggleExpand(group.statusCode)}
              />
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/*  Unified table block — same columns for admin & student             */
/* ------------------------------------------------------------------ */

function StatusGroupBlock({
  group,
  expanded,
  onToggle,
}: {
  group: SpecialStatusGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const code = group.statusCode;
  const colorClass = STATUS_COLOR[code] ?? "bg-gray-400 ring-gray-200";
  const abbr = STATUS_ABBR[code] ?? "?";
  const label = STATUS_LABEL_MAP[code] ?? group.statusLabel;

  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--twin-canvas-soft)] transition"
        onClick={onToggle}
      >
        <div
          className={`w-5 h-5 rounded-full ${colorClass} ring-1 flex items-center justify-center shadow-sm shrink-0`}
        >
          <span className="text-white text-[8px] font-bold leading-none">{abbr}</span>
        </div>
        <span className="text-sm font-medium text-[var(--twin-ink)]">{label}</span>
        <span className="ml-auto rounded-full bg-[var(--twin-canvas-soft)] px-2 py-0.5 text-xs text-[var(--twin-body)] font-medium">
          {group.count}
        </span>
        <span className="text-[10px] text-[var(--twin-mute)]">{expanded ? "收起" : "展开"}</span>
      </button>
      {expanded && group.cages.length > 0 && (
        <div className="border-t border-[var(--twin-hairline)] overflow-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)] sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left w-[70px]">位置</th>
                <th className="px-2 py-1.5 text-left w-[60px]">校区</th>
                <th className="px-2 py-1.5 text-left">房间</th>
                <th className="px-2 py-1.5 text-left">PI</th>
                <th className="px-2 py-1.5 text-left">部门</th>
                <th className="px-2 py-1.5 text-left">笼盒号</th>
                <th className="px-2 py-1.5 text-left">详情</th>
              </tr>
            </thead>
            <tbody>
              {group.cages.map((cage, idx) => (
                <tr key={idx} className="border-t border-[var(--twin-hairline)]">
                  <td className="px-2 py-1 font-mono">{cage.position}</td>
                  <td className="px-2 py-1">{cage.campusName || "-"}</td>
                  <td className="px-2 py-1">{cage.roomName || "-"}</td>
                  <td className="px-2 py-1">{cage.projectPiName || cage.piName || "-"}</td>
                  <td className="px-2 py-1 max-w-[140px] truncate">{cage.departmentName || "-"}</td>
                  <td className="px-2 py-1 font-mono text-[10px]">{cage.cageBoxQrCode || "-"}</td>
                  <td className="px-2 py-1 text-[var(--twin-mute)]">
                    {cage.detailName || cage.detailDescription || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
