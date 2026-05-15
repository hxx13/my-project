import { useCallback, useState } from "react";

/**
 * 类 UE：左 Outliner / 中 Viewport / 右 Details，侧栏可折叠以省纵向空间。
 */
export function DtEditShell({
  left,
  center,
  right,
}: {
  left: React.ReactNode;
  center: React.ReactNode;
  right: React.ReactNode;
}) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const toggleLeft = useCallback(() => setLeftOpen((v) => !v), []);
  const toggleRight = useCallback(() => setRightOpen((v) => !v), []);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 items-stretch gap-0.5">
      {leftOpen ? (
        <aside className="flex max-h-[min(94vh,920px)] min-h-0 w-[min(22rem,46vw)] max-w-[min(32rem,92vw)] shrink-0 flex-col gap-1 self-stretch rounded-md border border-slate-600/40 bg-slate-950/70 p-1.5 text-[10px] text-slate-200 shadow-inner sm:text-[11px]">
          <div className="flex shrink-0 items-center justify-between gap-1">
            <span className="font-semibold text-slate-300">编辑</span>
            <button
              type="button"
              className="rounded border border-slate-600/60 px-1 py-0.5 text-[9px] text-slate-400 hover:bg-slate-800/80"
              title="收起左侧栏"
              onClick={toggleLeft}
            >
              «
            </button>
          </div>
          <div className="dt-edit-shell-scroll min-h-0 flex-1 overflow-y-auto">{left}</div>
        </aside>
      ) : (
        <button
          type="button"
          className="pointer-events-auto shrink-0 self-start rounded border border-slate-600/50 bg-slate-900/80 px-1 py-2 text-[10px] text-slate-300 hover:bg-slate-800"
          title="展开左侧栏"
          onClick={toggleLeft}
        >
          »
        </button>
      )}
      <div className="relative min-h-0 min-w-0 flex-1">{center}</div>
      {rightOpen ? (
        <aside className="flex max-h-[min(94vh,920px)] min-h-0 w-[min(17rem,34vw)] shrink-0 flex-col gap-1 self-stretch rounded-md border border-slate-600/40 bg-slate-950/70 p-1.5 text-[10px] text-slate-200 shadow-inner sm:text-[11px]">
          <div className="flex shrink-0 items-center justify-between gap-1">
            <span className="font-semibold text-slate-300">细节</span>
            <button
              type="button"
              className="rounded border border-slate-600/60 px-1 py-0.5 text-[9px] text-slate-400 hover:bg-slate-800/80"
              title="收起右侧栏"
              onClick={toggleRight}
            >
            »
            </button>
          </div>
          <div className="dt-edit-shell-scroll min-h-0 flex-1 overflow-y-auto text-[clamp(9px,1.1vw,11px)]">{right}</div>
        </aside>
      ) : (
        <button
          type="button"
          className="pointer-events-auto shrink-0 self-start rounded border border-slate-600/50 bg-slate-900/80 px-1 py-2 text-[10px] text-slate-300 hover:bg-slate-800"
          title="展开右侧栏"
          onClick={toggleRight}
        >
          «
        </button>
      )}
    </div>
  );
}
