import { EDITOR_SHAPE_CATALOG } from "@/features/digital-twin-screen/layout/dtEditorShapeCatalog";

/** 编辑态：内置图形树（完成布局编辑后由父级不渲染本面板） */
export function DtShapeLibraryPanel({ onPick }: { onPick: (itemId: string) => void }) {
  return (
    <div className="dt-edit-shell-scroll pointer-events-auto flex max-h-[min(56vh,560px)] flex-col gap-1 overflow-y-auto rounded-md border border-slate-600/40 bg-slate-950/55 px-2 py-1.5 text-[10px] text-slate-200 shadow-md sm:text-[11px]">
      <span className="shrink-0 font-semibold text-slate-300">内置图形</span>
      <span className="shrink-0 text-[9px] leading-tight text-slate-500">
        点击添加；亦可右键空白画布。指示灯/条/空调单元为独立图元，样式见 dtEditorWidgetVisuals。
      </span>
      {EDITOR_SHAPE_CATALOG.map((folder) => (
        <details key={folder.id} className="rounded border border-slate-700/50 bg-slate-900/35" open>
          <summary className="cursor-pointer select-none px-1.5 py-1 text-slate-300 hover:bg-slate-800/60">{folder.label}</summary>
          <div className="flex flex-col gap-0.5 border-t border-slate-700/40 px-1 py-1">
            {folder.items.map((it) => (
              <button
                key={it.id}
                type="button"
                className="rounded px-1.5 py-0.5 text-left text-slate-200 hover:bg-cyan-950/50"
                onClick={() => onPick(it.id)}
              >
                {it.label}
              </button>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
