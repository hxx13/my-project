import type { RefDataItem } from "@/api/domains/referenceData.api";
import type { ReferenceTypeConfig } from "./typeRegistry";
import { webImageSrc } from "@/utils/mediaUrl";

interface ReferenceCardProps {
  item: RefDataItem;
  typeConfig: ReferenceTypeConfig;
  isAdmin: boolean;
  mode: string;
  onEdit: (item: RefDataItem) => void;
  onDrillDown: (item: RefDataItem) => void;
  onAddToCart?: (item: RefDataItem) => void;
  onDelete?: (item: RefDataItem) => void;
  orderingBlocked?: boolean;
}

function getFieldVal(item: RefDataItem, key: string): string {
  const fd = item.fieldData as Record<string, unknown> | undefined;
  const val = fd?.[key];
  if (val === undefined || val === null) return "";
  return String(val);
}

const LINE_FONTS = [
  "text-sm font-semibold text-[var(--twin-ink)]",
  "text-xs text-[var(--twin-body)]",
  "text-[11px] text-[var(--twin-mute)]",
  "text-[10px] text-[var(--twin-mute)]",
];

/**
 * 卡片三行文本（主标题 / 副标题 / 描述）。三端唯一实现：
 * PC 本组件、H5 `MobileAnimalOrderView` 都直接用；小程序在 `animalOrder/index.js` 内联镜像。
 * 全空时由调用方回退成 `ID {id}`。
 */
export function refCardLines(item: RefDataItem): string[] {
  const fd = item.fieldData as Record<string, unknown> | undefined;
  return ["title", "subtitle", "description"].map((k) => {
    const val = fd?.[k];
    return val === undefined || val === null ? "" : String(val);
  });
}

/**
 * 卡片价格标签。未开启价格返回 null（不占位，避免多数卡片被「无价格」噪声填满）。
 * 有规格价时取区间；区间为单值则只显示一个数。开启但未配价显示「待定」。
 */
export function refCardPrice(item: RefDataItem): string | null {
  const fd = item.fieldData as Record<string, unknown> | undefined;
  if (fd?.priceEnabled !== true) return null;

  const nums: number[] = [];
  const sp = fd.specPrices;
  if (sp && typeof sp === "object" && !Array.isArray(sp)) {
    for (const v of Object.values(sp as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) nums.push(n);
    }
  }
  if (nums.length === 0) {
    const raw = fd.price;
    const n = Number(raw);
    if (raw !== null && raw !== undefined && raw !== "" && Number.isFinite(n)) nums.push(n);
  }
  if (nums.length === 0) return "待定";

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? `¥${min.toFixed(2)}` : `¥${min.toFixed(2)} ~ ¥${max.toFixed(2)}`;
}

export default function ReferenceCard({
  item, typeConfig, isAdmin, mode, onEdit, onDrillDown, onAddToCart, onDelete, orderingBlocked,
}: ReferenceCardProps) {
  // SUPER_ADMIN can always drill; non-admin blocked when next level is empty or nonexistent
  const childCount = item.childCount ?? 0;
  const canDrill = !!typeConfig.childType;
  const hasChildren = childCount > 0;
  const hasDrillDown = canDrill && (isAdmin || hasChildren);
  const purchasable = (item.fieldData as Record<string, unknown>)?.purchasable === true;
  const imageUrl = getFieldVal(item, "imageUrl");
  const cover = imageUrl ? webImageSrc(imageUrl) : null;
  const showPurchase = purchasable && onAddToCart;
  const showEdit = isAdmin;

  // Always show 3 lines (title, subtitle, description) — empty = placeholder
  const lines = refCardLines(item);
  const isEmpty = lines.every(l => !l);
  const priceText = refCardPrice(item);

  return (
    <div
      onClick={hasDrillDown ? () => onDrillDown(item) : undefined}
      className={`relative flex flex-row items-stretch gap-3 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2 shadow-sm min-h-[6.5rem] ${hasDrillDown ? "cursor-pointer hover:border-[var(--twin-link)] hover:shadow-twin-level-1 transition-all duration-150" : ""}`}
    >
      {/* Image */}
      <div className="relative shrink-0 overflow-hidden rounded-md bg-[var(--twin-canvas-soft)] flex items-center justify-center aspect-square">
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="text-xl font-bold text-[var(--twin-mute)] select-none">{typeConfig.label.charAt(0)}</span>
        )}
      </div>

      {/* Text — own fields + independent spec lines */}
      <div className={`min-w-0 flex-1 flex flex-col justify-center py-1 ${showPurchase ? "pr-20" : showEdit ? "pr-6" : ""}`}>
        {/* Own fields: title, subtitle, etc. */}
        {isEmpty && <div className="truncate leading-snug text-sm font-semibold text-[var(--twin-ink)]">ID {item.id}</div>}
        {!isEmpty && lines.map((line, i) => (
          <div key={`own-${i}`} className={`truncate leading-snug ${LINE_FONTS[Math.min(i, LINE_FONTS.length - 1)]}`}>
            {line || " "}
            {i === 0 && (
              <span className={`inline-block w-1.5 h-1.5 rounded-full ml-1.5 align-middle ${item.status === 1 ? "bg-emerald-500" : "bg-neutral-400"}`} />
            )}
          </div>
        ))}

        {priceText && (
          <div className="mt-0.5 truncate text-xs font-bold tabular-nums text-[var(--twin-link)]">{priceText}</div>
        )}

      </div>

      {/* Admin edit + delete */}
      {showEdit && (
        <div className="absolute right-1 top-1 z-10 flex items-center gap-0.5">
          <button
            type="button" onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            className="p-1 rounded text-[var(--twin-mute)] hover:text-[var(--twin-link)] hover:bg-[var(--twin-canvas-soft)] transition-colors" title="编辑"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          </button>
          {onDelete && (
            <button
              type="button" onClick={(e) => { e.stopPropagation(); onDelete(item); }}
              className="p-1 rounded text-[var(--twin-mute)] hover:text-red-500 hover:bg-red-50 transition-colors" title="删除"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          )}
        </div>
      )}

      {/* Purchase button */}
      {showPurchase && (
        <button
          type="button"
          disabled={orderingBlocked}
          onClick={(e) => { e.stopPropagation(); onAddToCart(item); }}
          className="absolute right-2 bottom-2 z-10 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2.5 py-1 text-xs font-medium text-[var(--twin-body)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)] transition-all disabled:cursor-not-allowed disabled:opacity-50"
          title={orderingBlocked ? "当前不在可购时间窗口内" : undefined}
        >
          选购
        </button>
      )}
    </div>
  );
}
