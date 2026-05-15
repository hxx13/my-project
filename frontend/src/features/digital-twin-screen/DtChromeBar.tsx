import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function DtChromeBar({
  title,
  onBack,
  trailing,
}: {
  title: string;
  onBack: () => void;
  /** 标题与返回之间的工具区（如布局编辑） */
  trailing?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-cyan-500/20 bg-black/25 px-2 py-2 backdrop-blur-sm sm:gap-3 sm:px-3">
      <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
        <h1 className="truncate text-sm font-semibold tracking-wide text-cyan-200/95 sm:text-base">{title}</h1>
        <p className="truncate text-[10px] text-slate-500 sm:text-xs">环境拓扑 · Mock 数据</p>
      </div>
      {trailing ? <div className="order-3 flex max-w-full flex-1 flex-wrap items-center justify-end gap-1 sm:order-2 sm:flex-none">{trailing}</div> : null}
      <button
        type="button"
        onClick={onBack}
        className="order-2 ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cyan-500/35 bg-cyan-950/40 px-2.5 py-1.5 text-xs font-medium text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.15)] hover:bg-cyan-900/50 sm:order-3 sm:ml-0"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        返回
      </button>
    </header>
  );
}
