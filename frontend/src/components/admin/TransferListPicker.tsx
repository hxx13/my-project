import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TransferListOption {
  /** 唯一值（用于选中与去重） */
  value: string;
  /** 展示名 */
  label: string;
  /** 可选：右侧灰字后缀，如分类名 / 编号 */
  meta?: string;
}

interface Props {
  /** 全量候选项（已预加载） */
  options: TransferListOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** 每个实例唯一，用于 DOM key 去重 */
  idPrefix: string;
  className?: string;
  listMaxHeightClass?: string;
  availableLabel?: string;
  pickedLabel?: string;
  availableSearchPlaceholder?: string;
  pickedSearchPlaceholder?: string;
  /** 渲染在「可选」列搜索框上方（如分类筛选下拉） */
  availableHeader?: ReactNode;
}

/**
 * 双列穿梭选择器：左侧「可选」、右侧「已选」，各带独立搜索框。
 * 与门禁通道双列选择器同一视觉风格，用于已预加载候选项的场景（如门组多选）。
 */
export function TransferListPicker({
  options,
  selected,
  onChange,
  idPrefix,
  className,
  listMaxHeightClass = "max-h-64",
  availableLabel = "可选",
  pickedLabel = "已选",
  availableSearchPlaceholder = "搜索可选",
  pickedSearchPlaceholder = "搜索已选",
  availableHeader,
}: Props) {
  const [availKeyword, setAvailKeyword] = useState("");
  const [pickedKeyword, setPickedKeyword] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const matches = (kw: string, label: string, value: string, meta: string) => {
    if (!kw) return true;
    const k = kw.toLowerCase();
    return (
      label.toLowerCase().includes(k) ||
      value.toLowerCase().includes(k) ||
      meta.toLowerCase().includes(k)
    );
  };

  const available = options.filter((o) => {
    if (selectedSet.has(o.value)) return false;
    return matches(availKeyword.trim(), o.label, o.value, o.meta || "");
  });

  const picked = selected
    .map((v) => options.find((o) => o.value === v) ?? { value: v, label: v })
    .filter((o) => matches(pickedKeyword.trim(), o.label, o.value, o.meta || ""));

  const toggle = (value: string, add: boolean) => {
    if (add) {
      if (!selectedSet.has(value)) onChange([...selected, value]);
    } else {
      onChange(selected.filter((v) => v !== value));
    }
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex gap-2">
        {/* 左侧：可选 */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="shrink-0 text-xs text-[var(--twin-mute)]">{availableLabel}</div>
          {availableHeader}
          <input
            className="h-8 w-full shrink-0 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
            placeholder={availableSearchPlaceholder}
            value={availKeyword}
            onChange={(e) => setAvailKeyword(e.target.value)}
          />
          <div className={cn("overflow-auto rounded border border-[var(--twin-hairline)] p-1", listMaxHeightClass)}>
            {available.length === 0 ? (
              <div className="p-2 text-center text-xs text-[var(--twin-mute)]">无可选项</div>
            ) : (
              available.map((o) => (
                <button
                  key={`${idPrefix}-avail-${o.value}`}
                  type="button"
                  onClick={() => toggle(o.value, true)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                >
                  <span className="shrink-0 font-bold text-indigo-600">＋</span>
                  <span className="truncate">{o.label}</span>
                  {o.meta ? <span className="shrink-0 text-[10px] text-[var(--twin-mute)]">{o.meta}</span> : null}
                </button>
              ))
            )}
          </div>
        </div>
        {/* 右侧：已选 */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="shrink-0 text-xs text-[var(--twin-mute)]">{pickedLabel}（{picked.length}）</div>
          <input
            className="h-8 w-full shrink-0 rounded border border-[var(--twin-hairline)] px-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)]"
            placeholder={pickedSearchPlaceholder}
            value={pickedKeyword}
            onChange={(e) => setPickedKeyword(e.target.value)}
          />
          <div className={cn("overflow-auto rounded border border-[var(--twin-hairline)] p-1", listMaxHeightClass)}>
            {picked.length === 0 ? (
              <div className="p-2 text-center text-xs text-[var(--twin-mute)]">尚未选择</div>
            ) : (
              picked.map((o) => (
                <button
                  key={`${idPrefix}-picked-${o.value}`}
                  type="button"
                  onClick={() => toggle(o.value, false)}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                >
                  <span className="shrink-0 font-bold text-red-500">×</span>
                  <span className="truncate">{o.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
