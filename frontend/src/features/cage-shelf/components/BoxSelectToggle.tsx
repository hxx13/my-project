/**
 * 「矩形框选」开关 —— 笼位网格各多选模式下共用的那一枚。
 *
 * 光看代码它只是个按钮，但样式（关闭=虚线描边、开启=琥珀实底）和文案在两处必须完全一致，
 * 否则同一个开关在工具栏与底部动作条里长得不一样，用户会以为是两个功能。
 * 原来这段 JSX 在本文件里复制了 6 份，第 7 份出现时抽出来。
 *
 * 状态仍由调用方持有（`boxSelectMode`），本组件只是那枚按钮的外观与点击。
 */
export default function BoxSelectToggle({
  on,
  onToggle,
  title,
}: {
  on: boolean;
  /** 切换；调用方负责同时清掉框选起点（换了开关，上一次的起点就作废了） */
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title ?? (on ? "框选中：点第一格设起点，再点对角格完成" : "开启矩形框选：点两个对角格即可整片选中")}
      className={`rounded-twin-md px-2 py-1 text-[11px] font-semibold transition ${
        on
          ? "bg-amber-500 text-white shadow-sm"
          : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)] border border-dashed border-[var(--twin-hairline)]"
      }`}
    >
      {on ? "框选中 · 点击两格" : "⬜ 矩形框选"}
    </button>
  );
}
