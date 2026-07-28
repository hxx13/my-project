import { useCageColors, DEFAULT_COLORS } from "./CageColorContext";
import { CAGE_TYPE_DOT, STATUS_COLOR_DOT } from "./CageCellOverlays";

const STATUS_ITEMS: { code: string; label: string }[] = [
  { code: "NORMAL",          label: "正常" },
  { code: "COHABITATION",   label: "合笼/繁殖" },
  { code: "SPECIAL_FEEDING", label: "特殊饲养" },
  { code: "NEED_DIVIDE",    label: "请分笼/密度超标" },
  { code: "HEALTH_ABNORMAL", label: "动物健康异常" },
  { code: "ANIMAL_TRANSFER", label: "动物转移" },
];

const CAGE_ITEMS = [
  { type: 1, label: "等待分配" },
  { type: 2, label: "已预约(空笼盒)" },
  { type: 3, label: "已预约(饲养中)" },
  { type: 4, label: "异常" },
];

interface Props { collapsed?: boolean; }

export default function CageShelfLegend({ collapsed }: Props) {
  const { colors, setColor, resetColor } = useCageColors();

  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 text-xs">
      <details open={!collapsed} className="space-y-3">
        <summary className="cursor-pointer font-semibold text-[var(--twin-ink)] select-none">
          图例说明 (点击色块调色，自动保存)
        </summary>

        {/* ============ 特殊状态 → 背景色 ============ */}
        <div>
          <div className="mb-1.5 text-[var(--twin-mute)] font-medium">特殊状态 → 格子背景高亮色</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {STATUS_ITEMS.map((item) => {
              const c = colors[item.code] ?? DEFAULT_COLORS[item.code] ?? { bg: "#ccc", border: "#999" };
              return (
                <div key={item.code} className="flex items-center gap-1.5 group">
                  <label className="cursor-pointer" title="背景色">
                    <input type="color" className="sr-only" value={c.bg}
                      onChange={(e) => setColor(item.code, e.target.value, c.border)} />
                    <div className="w-8 h-5 rounded border-2" style={{ backgroundColor: c.bg, borderColor: c.border }} />
                  </label>
                  <label className="cursor-pointer" title="边框色">
                    <input type="color" className="sr-only" value={c.border}
                      onChange={(e) => setColor(item.code, c.bg, e.target.value)} />
                    <span className="sr-only">边框</span>
                  </label>
                  <span className="text-[var(--twin-body)]">{item.label}</span>
                  <button type="button" className="text-[var(--twin-mute)] hover:text-red-500 hidden group-hover:inline text-[10px] shrink-0"
                    onClick={() => resetColor(item.code)} aria-label="恢复默认">↺</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ============ 笼位状态 → 指示灯 ============ */}
        <div>
          <div className="mb-1.5 text-[var(--twin-mute)] font-medium">笼位状态 → 右上角指示灯</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {CAGE_ITEMS.map((item) => {
              const dot = CAGE_TYPE_DOT[item.type] ?? "bg-gray-400 ring-gray-200";
              const abbr = item.type === 1 ? "待" : item.type === 2 ? "空" : item.type === 3 ? "饲" : "异";
              return (
                <div key={item.type} className="flex items-center gap-1.5">
                  <div className={`w-4 h-4 rounded-full ${dot} ring-1 flex items-center justify-center shadow-sm`}>
                    <span className="text-white text-[7px] font-bold leading-none">{abbr}</span>
                  </div>
                  <span className="text-[var(--twin-body)]">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </details>
    </div>
  );
}
