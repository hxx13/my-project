/** 手机 H5 — 笼架特殊状态总览（居中弹窗，状态 → 房间·笼架 → 笼位） */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import type { SpecialStatusOverview } from "@/api/domains/cageShelf.api";
import { STATUS_ABBR, STATUS_LABEL_MAP } from "@/features/cage-shelf/components/CageCellOverlays";
import {
  enrichSpecialStatusGroups,
  type SpecialStatusGroupEnriched,
  type SpecialStatusShelfGroup,
} from "@/utils/specialStatusGrouping";
import type { SpecialStatusCage } from "@/api/domains/cageShelf.api";

const STATUS_DOT: Record<string, string> = {
  COHABITATION: "var(--student-success, #16a34a)",
  SPECIAL_FEEDING: "var(--student-danger, #dc2626)",
  NEED_DIVIDE: "#ca8a04",
  HEALTH_ABNORMAL: "#9333ea",
  ANIMAL_TRANSFER: "#0284c7",
  NORMAL: "var(--student-mute, #94a3b8)",
};

interface Props {
  open: boolean;
  onClose: () => void;
  apiFn: () => Promise<SpecialStatusOverview>;
  /** student = 本课题组；staff = 全量 */
  variant?: "student" | "staff";
}

export default function MobileSpecialStatusPanel({ open, onClose, apiFn, variant = "student" }: Props) {
  const [data, setData] = useState<SpecialStatusOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<Set<string>>(new Set());
  const [expandedShelf, setExpandedShelf] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpandedStatus(new Set());
    setExpandedShelf(new Set());
    void (async () => {
      try {
        const result = await apiFn();
        if (cancelled) return;
        setData(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, apiFn]);

  const enrichedGroups = useMemo(
    () => (data?.groups ? enrichSpecialStatusGroups(data.groups) : []),
    [data],
  );

  if (!open) return null;

  const isStudent = variant === "student";

  const toggleStatus = (code: string) => {
    setExpandedStatus((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleShelf = (key: string) => {
    setExpandedShelf((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-[var(--student-radius-lg)] bg-[var(--student-surface-raised)]"
        style={{ maxHeight: "85vh", boxShadow: "var(--student-shadow-modal)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-special-status-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-[var(--student-hairline)] px-4 py-3">
          <div className="min-w-0 pr-1">
            <p
              id="mobile-special-status-title"
              className="truncate text-[15px] font-semibold text-[var(--student-ink)]"
            >
              特殊状态总览{isStudent ? "（本课题组）" : ""}
            </p>
            {data?.scannedAt && (
              <p className="mt-0.5 text-[11px] text-[var(--student-mute)]">
                上次扫描 {data.scannedAt} · 共 {data.totalAbnormal} 个特殊笼位
              </p>
            )}
          </div>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-[var(--student-radius-sm)] text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)] hover:text-[var(--student-ink)] active:opacity-80"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-[var(--student-mute)]">
              <Loader2 className="size-5 animate-spin text-[var(--student-primary)]" aria-hidden />
              加载中…
            </div>
          )}
          {error && (
            <p className="py-10 text-center text-sm text-[var(--student-error)]">{error}</p>
          )}
          {!loading && !error && data && data.groups.length === 0 && (
            <div className="py-10 text-center text-sm text-[var(--student-mute)]">
              <AlertTriangle className="mx-auto mb-2 size-8 opacity-40" aria-hidden />
              暂无特殊状态笼位
            </div>
          )}
          {!loading && !error && enrichedGroups.length > 0 && (
            <div className="space-y-2 pb-1">
              {enrichedGroups.map((group) => (
                <StatusGroupBlock
                  key={group.statusCode}
                  group={group}
                  expanded={expandedStatus.has(group.statusCode)}
                  expandedShelf={expandedShelf}
                  onToggle={() => toggleStatus(group.statusCode)}
                  onToggleShelf={toggleShelf}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusGroupBlock({
  group,
  expanded,
  expandedShelf,
  onToggle,
  onToggleShelf,
}: {
  group: SpecialStatusGroupEnriched;
  expanded: boolean;
  expandedShelf: Set<string>;
  onToggle: () => void;
  onToggleShelf: (key: string) => void;
}) {
  const code = group.statusCode;
  const dotColor = STATUS_DOT[code] ?? "var(--student-mute)";
  const abbr = STATUS_ABBR[code] ?? "?";
  const label = STATUS_LABEL_MAP[code] ?? group.statusLabel;
  const cageCount = group.cages.length;

  return (
    <div className="overflow-hidden rounded-[var(--student-radius-md)] border border-[var(--student-hairline)] bg-[var(--student-surface)]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-[var(--student-canvas-soft)]"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div
          className="flex size-5 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: dotColor }}
        >
          <span className="text-[8px] font-bold leading-none text-white">{abbr}</span>
        </div>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--student-ink)]">
          {label}
        </span>
        <span className="rounded-full bg-[var(--student-canvas-soft)] px-2 py-0.5 text-[11px] text-[var(--student-body)]">
          {cageCount}
        </span>
        {expanded ? (
          <ChevronUp className="size-4 shrink-0 text-[var(--student-mute)]" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-[var(--student-mute)]" aria-hidden />
        )}
      </button>

      {expanded && group.shelfGroups.length > 0 && (
        <div className="space-y-1.5 border-t border-[var(--student-hairline)] px-2 py-2">
          {group.shelfGroups.map((shelf) => (
            <ShelfGroupBlock
              key={`${group.statusCode}-${shelf.key}`}
              shelf={shelf}
              statusCode={group.statusCode}
              expanded={expandedShelf.has(`${group.statusCode}:${shelf.key}`)}
              onToggle={() => onToggleShelf(`${group.statusCode}:${shelf.key}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShelfGroupBlock({
  shelf,
  statusCode,
  expanded,
  onToggle,
}: {
  shelf: SpecialStatusShelfGroup;
  statusCode: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)]">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-2.5 py-2 text-left active:bg-[var(--student-surface)]"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-[var(--student-ink)]">{shelf.title}</p>
          {shelf.meta && (
            <p className="mt-0.5 truncate text-[10px] text-[var(--student-mute)]">{shelf.meta}</p>
          )}
        </div>
        <span className="shrink-0 pt-0.5 text-[10px] text-[var(--student-mute)]">
          {shelf.cages.length} 位
        </span>
        {expanded ? (
          <ChevronUp className="mt-0.5 size-3.5 shrink-0 text-[var(--student-mute)]" aria-hidden />
        ) : (
          <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-[var(--student-mute)]" aria-hidden />
        )}
      </button>

      {expanded && (
        <div className="max-h-44 overflow-y-auto overscroll-y-contain border-t border-[var(--student-hairline)]">
          {shelf.cages.map((cage) => (
            <CageRow
              key={`${statusCode}-${shelf.key}-${cage.position}-${cage.positionX}-${cage.positionY}`}
              cage={cage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CageRow({ cage }: { cage: SpecialStatusCage }) {
  return (
    <div className="border-b border-[var(--student-hairline)] px-2.5 py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-[11px] font-semibold text-[var(--student-ink)]">
          {cage.position}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--student-ink)]">
          PI {cage.projectPiName || cage.piName || "—"}
        </span>
      </div>
      {(cage.detailName || cage.detailDescription) && (
        <p className="mt-0.5 truncate text-[10px] text-[var(--student-mute)]">
          {cage.detailName || cage.detailDescription}
        </p>
      )}
    </div>
  );
}
