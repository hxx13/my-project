interface Props {
  pickTwoPoint: boolean;
  pickAnchor: { x: number; y: number } | null;
  onCancel: () => void;
}

export default function AgvPickModeBar({ pickTwoPoint, pickAnchor, onCancel }: Props) {
  return (
    <div
      onClick={onCancel}
      className="absolute top-10 left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--app-color-accent)] text-white text-xs font-medium shadow-lg cursor-pointer hover:opacity-90 transition-opacity select-none"
    >
      <span className="text-base">{pickTwoPoint ? "📐" : "📍"}</span>
      {pickTwoPoint ? (
        pickAnchor ? (
          <span>点击第二个角点完成矩形区域</span>
        ) : (
          <span>点击第一个角点标记矩形区域</span>
        )
      ) : (
        <span>在地图上点击标记位置</span>
      )}
      <span className="text-[10px] opacity-70">· Esc 取消</span>
    </div>
  );
}
