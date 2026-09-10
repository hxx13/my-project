import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { X, SplitSquareHorizontal, MoveRight } from "lucide-react";
import { submitCageDivide, submitCageTransfer, type CageOpTarget } from "@/api/domains/cageShelf.api";
import { CageFormModalPortal } from "./CageFormModalPortal";
import { displayPosition } from "../constants";
import type { CageOpKind, CageOpSource } from "../useCageOpSelect";

/** 坐标 → 位号，与网格显示同一套换算（A-1 在底行，显示为 A-10） */
function positionLabel(x?: number | null, y?: number | null): string {
  if (x == null || y == null) return "—";
  return displayPosition(`${x}-${y}`);
}

function whereOf(t: CageOpTarget): string {
  return [t.campusName, t.roomName, t.shelveName].filter(Boolean).join(" / ");
}

/**
 * 分笼 / 转移的确认弹窗 — 三端共用。
 * 目标已在主网格上选好，这里只复核坐标 + 补充保留源笼位/原因，然后提交。
 *
 * 样式**自包含**：不用 `.aup-modal*`（那些定义在 aup.css，笼架页没 import，
 * 类名落空后 `border:1px solid var(--border)` 会解析成生硬黑边）。这里只用 twin 令牌。
 */
export default function CageOperationDialog({
  open,
  op,
  source,
  picked,
  onClose,
  onDone,
}: {
  open: boolean;
  op: CageOpKind;
  source: CageOpSource | null;
  picked: CageOpTarget[];
  onClose: () => void;
  onDone?: () => void;
}) {
  /** 分笼默认保留源笼位；不勾选才会把源笼位归档为空笼盒 */
  const [keepSource, setKeepSource] = useState(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isDivide = op === "divide";

  useEffect(() => {
    if (open) {
      setKeepSource(true);
      setReason("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !source) return null;

  const handleSubmit = async () => {
    if (picked.length === 0) {
      toast.error(isDivide ? "请先选择分笼目标笼位" : "请先选择转移目标笼位");
      return;
    }
    setSubmitting(true);
    try {
      const res = isDivide
        ? await submitCageDivide({
            sourceAnimalCageId: source.animalCageId,
            targetAnimalCageIds: picked.map((t) => t.animalCageId),
            keepSource,
            reason: reason.trim() || undefined,
          })
        : await submitCageTransfer({
            fromAnimalCageId: source.animalCageId,
            toAnimalCageId: picked[0].animalCageId,
            reason: reason.trim() || undefined,
          });
      toast.success(res.needApproval ? "已提交，等待审核" : "操作已完成");
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const title = isDivide ? "确认分笼" : "确认转移笼位";
  const Icon = isDivide ? SplitSquareHorizontal : MoveRight;

  return (
    <CageFormModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
        className="fixed inset-0 z-[var(--z-modal,800)] grid place-items-center bg-slate-900/35 p-4 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[86vh] w-[92vw] max-w-[560px] flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] shadow-[0_24px_70px_-12px_rgba(15,23,42,0.35)] ring-1 ring-black/5"
        >
          {/* 头部 */}
          <header className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-5">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-twin-lg bg-[var(--twin-primary-soft,#eef2ff)] text-[var(--twin-primary)]">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold leading-tight text-[var(--twin-ink)]">{title}</h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--twin-mute)]">
                {isDivide
                  ? "表单将整表复制到选中的目标笼位作为基础信息"
                  : "占用者、动物信息与状态标记将整体迁入目标笼位"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-twin-md text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft-2)] hover:text-[var(--twin-ink)]"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {/* 源笼位 */}
            <div className="rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--twin-mute)]">源笼位</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-[15px] font-semibold text-[var(--twin-ink)]">
                  {source.position ? displayPosition(source.position) : source.animalCageId}
                </span>
                {source.occupantName && (
                  <span className="text-[11px] text-[var(--twin-mute)]">占用者 {source.occupantName}</span>
                )}
              </div>
            </div>

            {/* 目标列表 */}
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--twin-ink)]">
                {isDivide ? "分笼目标" : "转移目标"}
              </span>
              <span className="text-[11px] text-[var(--twin-mute)]">{picked.length} 个</span>
            </div>
            <div className="mt-2 overflow-hidden rounded-twin-lg bg-[var(--twin-canvas-soft)]">
              {picked.length === 0 ? (
                <div className="px-3.5 py-6 text-center text-[11px] text-[var(--twin-mute)]">未选择目标笼位</div>
              ) : (
                picked.map((t) => (
                  <div
                    key={t.animalCageId}
                    className="flex items-center gap-3 px-3.5 py-2.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--twin-hairline)]"
                  >
                    <span className="shrink-0 rounded-twin-sm bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--twin-ink)]">
                      {positionLabel(t.positionX, t.positionY)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--twin-mute)]">{whereOf(t)}</span>
                    {t.aupNumber && (
                      <span className="shrink-0 font-mono text-[10px] text-[var(--twin-mute)]">{t.aupNumber}</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {isDivide && (
              <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={keepSource}
                  onChange={(e) => setKeepSource(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--twin-primary)]"
                />
                <span className="text-[11px] leading-relaxed text-[var(--twin-ink)]">
                  保留原笼位不变
                  <span className="ml-1 text-[var(--twin-mute)]">（不勾选则源笼位归档为空笼盒）</span>
                </span>
              </label>
            )}

            <input
              type="text"
              placeholder="原因（可选，会记入留痕）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-3 mb-5 w-full rounded-twin-lg bg-[var(--twin-canvas-soft)] px-3.5 py-2.5 text-[12px] text-[var(--twin-ink)] outline-none ring-1 ring-transparent transition placeholder:text-[var(--twin-mute)] focus:bg-[var(--twin-canvas)] focus:ring-[var(--twin-primary)]/40"
            />
          </div>

          {/* 底部 */}
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--twin-hairline)] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-twin-md px-3.5 py-2 text-[12px] font-semibold text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft-2)] hover:text-[var(--twin-ink)] disabled:opacity-50"
            >
              返回选位
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || picked.length === 0}
              className="rounded-twin-md bg-[var(--twin-primary)] px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
            >
              {submitting ? "提交中…" : isDivide ? `确认分笼（${picked.length}）` : "确认转移"}
            </button>
          </footer>
        </motion.div>
      </motion.div>
    </CageFormModalPortal>
  );
}
