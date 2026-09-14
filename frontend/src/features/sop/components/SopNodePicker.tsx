import { useMemo } from "react";
import type { SopNode } from "@/api/domains/sop.api";
import { flattenForPicker } from "../sopTree";
import { cn } from "@/lib/utils";

/**
 * 分类选择器：原生 `<select>` + 缩进层级。
 *
 * 分类树通常只有几十个节点，原生下拉够用且天然可键盘操作、移动端就是系统选择器 ——
 * 为它再写一棵带浮层的树选择器（项目里已有 AssetLocationTreeSelect / SpaceTreeSelect 两套）
 * 是重复造轮子。真长到几百个节点再换。
 */
export function SopNodePicker({
  nodes,
  value,
  onChange,
  excludeIds,
  rootOptionLabel = "（顶层 / 未分类）",
  className,
}: {
  nodes: SopNode[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** 不可选的节点（自己 + 自己整棵子树） */
  excludeIds?: Set<number>;
  rootOptionLabel?: string;
  className?: string;
}) {
  const options = useMemo(
    () => flattenForPicker(nodes, rootOptionLabel).filter((o) => o.id === null || !excludeIds?.has(o.id)),
    [nodes, excludeIds, rootOptionLabel],
  );

  return (
    <select
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={cn(
        "w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1.5 text-sm text-[var(--app-color-text-primary)] outline-none",
        className,
      )}
    >
      {options.map((o) => (
        // 缩进用全角空格，`<option>` 里的普通空格会被 HTML 折叠掉
        <option key={o.id ?? "__root"} value={o.id == null ? "" : String(o.id)}>
          {o.label.replace(/^ +/, (m) => "　".repeat(m.length))}
        </option>
      ))}
    </select>
  );
}

export default SopNodePicker;
