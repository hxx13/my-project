// 三个节点组件共用的卡片骨架 + 展示层数据类型。
// 只做「展示」：数据通过 React Flow 的 data 属性传入，不接 zustand / 不接遥测轮询。

import type { ReactNode } from "react";
import type { BindingSemantic, NodeKind } from "@/features/digital-twin/schema/types";
import { ACCENT_COLOR, ALARM_COLOR, NODE_KIND_COLOR, NODE_KIND_FILL, semanticTag } from "../theme";

/** 等宽字体栈，用于遥测读数。 */
export const MONO_FONT = '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** 一个已展开为可显示字符串的遥测绑定槽。 */
export type TwinBindingDisplay = {
  /** 展示标签（如「频率」「送风温」）；缺省或为空串时按 semantic 兜底。 */
  label: string;
  unit?: string;
  /** 已格式化的读数文本（editor/页面层负责格式化）。 */
  value: string;
  /** 可选：保留语义以在 label 缺失时兜底短标签。 */
  semantic?: BindingSemantic;
};

/** 节点通过 React Flow data 属性传入的展示数据。 */
export type TwinNodeData = {
  kind: NodeKind;
  title: string;
  sublabel?: string;
  bindings: TwinBindingDisplay[];
  /** true 时边框/发光切到告警色并脉冲。 */
  alarm?: boolean;
};

/** 单个绑定的展示行：`<label> <value><unit>`，等宽字体、值用青色。 */
export function BindingInline({ binding }: { binding: TwinBindingDisplay }) {
  const tag = binding.label || semanticTag(binding.semantic ?? "generic");
  return (
    <span
      style={{
        fontFamily: MONO_FONT,
        fontSize: 11,
        lineHeight: "14px",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "var(--twin-mute)" }}>{tag} </span>
      <span style={{ color: ACCENT_COLOR }}>{binding.value}</span>
      {binding.unit ? <span style={{ color: "var(--twin-mute)" }}>{binding.unit}</span> : null}
    </span>
  );
}

export interface NodeCardProps {
  data: TwinNodeData;
  width: number;
  height: number;
  children?: ReactNode;
}

/** 固定尺寸的圆角卡片骨架：边框/填充/发光按 kind 取色，alarm 时切告警色并脉冲。 */
export function NodeCard({ data, width, height, children }: NodeCardProps) {
  const color = NODE_KIND_COLOR[data.kind];
  const fill = NODE_KIND_FILL[data.kind];
  const borderColor = data.alarm ? ALARM_COLOR : color;
  const glowColor = data.alarm ? ALARM_COLOR : color;

  return (
    <div
      className={data.alarm ? "animate-pulse" : undefined}
      style={{
        width,
        height,
        boxSizing: "border-box",
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        background: fill,
        boxShadow: `0 0 10px color-mix(in srgb, ${glowColor} 30%, transparent)`,
        color: "var(--twin-ink)",
        padding: "7px 14px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
        position: "relative",
        overflow: "hidden",
        cursor: "grab",
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          lineHeight: "18px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {data.title}
      </div>
      {data.sublabel ? (
        <div
          style={{
            fontSize: 11,
            color: "var(--twin-mute)",
            lineHeight: "13px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {data.sublabel}
        </div>
      ) : null}
      {children}
    </div>
  );
}
