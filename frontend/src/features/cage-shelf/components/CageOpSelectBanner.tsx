import type { CageOpSelect } from "../useCageOpSelect";
import { displayPosition } from "../constants";

/**
 * 选位模式横幅 — 三端共用。
 * 进入分笼/转移选位后显示在网格上方：说明、已选数量、确认/取消。
 * 转移模式下额外提供「批量转移」入口（多源按顺序配多目标，见 BatchTransferPanel）。
 */
export default function CageOpSelectBanner({
  sel,
  allowBatch,
}: {
  sel: CageOpSelect;
  /** 是否提供批量转移入口（仅 Web 管理端） */
  allowBatch?: boolean;
}) {
  if (!sel.active) return null;
  const isDivide = sel.kind === "divide";

  if (sel.batch) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-twin-lg border border-[var(--twin-primary)] bg-[var(--twin-primary-soft,#eef2ff)] px-3 py-2">
        <span className="rounded-twin-md bg-[var(--twin-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
          批量转移
        </span>
        <span className="text-[11px] font-semibold text-[var(--twin-ink)]">
          源 {sel.sourceOrder.length} · 目标 {sel.targetOrder.length}
        </span>
        <span className="text-[11px] text-[var(--twin-mute)]">
          {sel.phase === "sources"
            ? "勾选需转移的笼位：仅限同一课题组且饲养中的笼位（可跨房间）。顺序即配对顺序，右侧面板可拖拽重排"
            : "按顺序点击绿色高亮的空笼位作为目标，同色即一对"}
        </span>
        <button
          type="button"
          onClick={sel.cancel}
          className="ml-auto rounded-twin-md border border-[var(--twin-hairline-strong)] px-3 py-1 text-[11px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft-2)]"
        >
          退出批量转移
        </button>
      </div>
    );
  }

  const hint = sel.loading
    ? "正在加载可选的笼位…"
    : sel.error
      ? sel.error
      : isDivide
        ? "点击绿色高亮的笼位选择分笼目标（可多选，可切换笼架继续选）"
        : "点击绿色高亮的笼位选择转移目标（单选，可切换笼架）";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-twin-lg border border-[var(--twin-primary)] bg-[var(--twin-primary-soft,#eef2ff)] px-3 py-2">
      <span className="rounded-twin-md bg-[var(--twin-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
        {isDivide ? "分笼选位" : "转移选位"}
      </span>
      <span className="text-[11px] font-semibold text-[var(--twin-ink)]">
        源笼位 {sel.source?.position ? displayPosition(sel.source.position) : sel.source?.animalCageId}
      </span>
      <span className={`text-[11px] ${sel.error ? "text-red-500" : "text-[var(--twin-mute)]"}`}>{hint}</span>
      <span className="ml-auto text-[11px] font-semibold text-[var(--twin-ink)]">已选 {sel.selected.size}</span>
      {!isDivide && allowBatch && (
        <button
          type="button"
          onClick={sel.startBatch}
          className="rounded-twin-md border border-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-[var(--twin-primary)] transition hover:bg-[var(--twin-primary)] hover:text-white"
        >
          批量转移
        </button>
      )}
      <button
        type="button"
        disabled={sel.selected.size === 0}
        onClick={sel.openConfirm}
        className="rounded-twin-md bg-[var(--twin-primary)] px-3 py-1 text-[11px] font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
      >
        确认
      </button>
      <button
        type="button"
        onClick={sel.cancel}
        className="rounded-twin-md border border-[var(--twin-hairline-strong)] px-3 py-1 text-[11px] font-semibold text-[var(--twin-ink)] transition hover:bg-[var(--twin-canvas-soft-2)]"
      >
        取消
      </button>
    </div>
  );
}
