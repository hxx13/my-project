// 右侧详情面板：根据 store.selected 展示并编辑节点或风管的属性。
// 中性色统一走项目的 --twin-* 变量（随浅色/深色自动切换）。

import { useEffect, useState } from "react";
import type { TelemetryVariable } from "@/features/digital-twin/telemetry/adapter";
import { MockTelemetryAdapter } from "@/features/digital-twin/telemetry/mock";
import type { BindingSlot, EdgeRole, NodeKind, TwinEdge, TwinNode } from "@/features/digital-twin/schema/types";
import { currentGraph, useDigitalTwinStore } from "./store";

/** kind 下拉选项。 */
const KIND_OPTIONS: { value: NodeKind; label: string }[] = [
  { value: "equipment", label: "设备" },
  { value: "acZone", label: "空调区" },
  { value: "room", label: "房间" },
];

/** lane 下拉选项。 */
const LANE_OPTIONS = ["设备", "空调区", "房间"];

/** role 下拉选项。 */
const ROLE_OPTIONS: { value: EdgeRole; label: string }[] = [
  { value: "main", label: "送风" },
  { value: "return", label: "回风" },
];

/** 面板根容器类（两处详情面板共用）。 */
const PANEL = "flex h-full w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3";
const INPUT = "rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft-2)] px-2 py-1.5 text-sm text-[var(--twin-ink)] outline-none focus:border-[var(--twin-hairline-strong)]";
const LABEL = "text-xs text-[var(--twin-mute)]";

function makeDefaultBinding(): BindingSlot {
  return { variableName: "", label: "读数", semantic: "generic", format: "number", bindingKind: "readout" };
}

/** 一个绑定槽的行：变量下拉 + label/unit 展示 + 删除。 */
function BindingRow({
  binding,
  variables,
  onChange,
  onRemove,
}: {
  binding: BindingSlot;
  variables: TelemetryVariable[];
  onChange: (variableName: string) => void;
  onRemove: () => void;
}) {
  const options = variables.map((v) => v);
  const currentIsListed = options.some((v) => v.name === binding.variableName);
  if (binding.variableName && !currentIsListed) {
    options.unshift({ name: binding.variableName });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={binding.variableName}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} min-w-0 flex-1 text-xs`}
      >
        <option value="">未绑定</option>
        {options.map((v) => (
          <option key={v.name} value={v.name}>
            {v.group ? `${v.group} · ${v.name}` : v.name}
          </option>
        ))}
      </select>
      <span className="w-20 shrink-0 truncate text-xs text-[var(--twin-mute)]">
        {binding.label || "—"}
        {binding.unit ? ` ${binding.unit}` : ""}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md border border-[var(--twin-hairline)] px-2 py-1 text-xs text-[var(--twin-mute)] hover:border-[var(--twin-error)] hover:text-[var(--twin-error)]"
      >
        删除
      </button>
    </div>
  );
}

function NodeInspector({ node, variables }: { node: TwinNode; variables: TelemetryVariable[] }) {
  const store = useDigitalTwinStore.getState;

  const updateBinding = (index: number, variableName: string) => {
    const bindings = node.bindings.map((b, i) => (i === index ? { ...b, variableName } : b));
    store().updateNode(node.id, { bindings });
  };
  const addBinding = () => {
    store().updateNode(node.id, { bindings: [...node.bindings, makeDefaultBinding()] });
  };
  const removeBinding = (index: number) => {
    const bindings = node.bindings.filter((_, i) => i !== index);
    store().updateNode(node.id, { bindings });
  };

  return (
    <div className={PANEL}>
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--twin-mute)]">节点</div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>标题</span>
        <input value={node.title} onChange={(e) => store().updateNode(node.id, { title: e.target.value })} className={INPUT} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>类型</span>
        <select
          value={node.kind}
          onChange={(e) => store().updateNode(node.id, { kind: e.target.value as NodeKind })}
          className={INPUT}
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>泳道</span>
        <select value={node.lane} onChange={(e) => store().updateNode(node.id, { lane: e.target.value })} className={INPUT}>
          {LANE_OPTIONS.map((lane) => (
            <option key={lane} value={lane}>
              {lane}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <span className={LABEL}>绑定槽</span>
        {node.bindings.map((binding, index) => (
          <BindingRow
            key={index}
            binding={binding}
            variables={variables}
            onChange={(variableName) => updateBinding(index, variableName)}
            onRemove={() => removeBinding(index)}
          />
        ))}
        <button
          type="button"
          onClick={addBinding}
          className="rounded-md border border-dashed border-[var(--twin-hairline-strong)] px-2 py-1.5 text-xs text-[var(--twin-body)] hover:border-[var(--twin-hairline)]"
        >
          ＋绑定
        </button>
      </div>

      <button
        type="button"
        onClick={() => store().deleteSelected()}
        className="rounded-md border border-[var(--twin-error)] bg-[color-mix(in_srgb,var(--twin-error)_8%,transparent)] px-2 py-2 text-sm text-[var(--twin-error)] hover:bg-[color-mix(in_srgb,var(--twin-error)_16%,transparent)]"
      >
        删除节点
      </button>
    </div>
  );
}

function EdgeInspector({ edge }: { edge: TwinEdge }) {
  const store = useDigitalTwinStore.getState;

  return (
    <div className={PANEL}>
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--twin-mute)]">风管</div>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>气流角色</span>
        <select
          value={edge.role}
          onChange={(e) => store().updateEdge(edge.id, { role: e.target.value as EdgeRole })}
          className={INPUT}
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>风量 (m³/h)</span>
        <input
          type="number"
          value={edge.flow}
          onChange={(e) => store().updateEdge(edge.id, { flow: e.target.value === "" ? 0 : Number(e.target.value) })}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>标签</span>
        <input value={edge.label ?? ""} onChange={(e) => store().updateEdge(edge.id, { label: e.target.value })} className={INPUT} />
      </label>

      <button
        type="button"
        onClick={() => store().deleteSelected()}
        className="rounded-md border border-[var(--twin-error)] bg-[color-mix(in_srgb,var(--twin-error)_8%,transparent)] px-2 py-2 text-sm text-[var(--twin-error)] hover:bg-[color-mix(in_srgb,var(--twin-error)_16%,transparent)]"
      >
        删除风管
      </button>
    </div>
  );
}

export function Inspector() {
  const mode = useDigitalTwinStore((s) => s.mode);
  const selected = useDigitalTwinStore((s) => s.selected);
  const graph = useDigitalTwinStore(currentGraph);
  const [variables, setVariables] = useState<TelemetryVariable[]>([]);

  useEffect(() => {
    let cancelled = false;
    const adapter = new MockTelemetryAdapter();
    void adapter.listVariables().then((vars) => {
      if (!cancelled) setVariables(vars);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === "display") return null;

  const node = selected?.kind === "node" ? graph.nodes.find((n) => n.id === selected.id) : undefined;
  const edge = selected?.kind === "edge" ? graph.edges.find((e) => e.id === selected.id) : undefined;

  if (!selected || (!node && !edge)) {
    return (
      <div className="flex h-full w-72 shrink-0 items-center justify-center border-l border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-4 text-center text-sm text-[var(--twin-mute)]">
        未选中节点或风管。点击画布中的元素以查看并编辑属性。
      </div>
    );
  }

  if (node) return <NodeInspector node={node} variables={variables} />;
  return <EdgeInspector edge={edge as TwinEdge} />;
}
