import { useState } from "react";
import { useRules, useSaveRule, useToggleRule, ACTIVITY_LABELS, type AgvActivityRule } from "@/api/domains/agv-analysis.api";
import { Plus, Settings2, AlertTriangle } from "lucide-react";

const PRIMITIVE_OPTIONS = ["MOVE_START","MOVE_END","REVERSE","TURN","CREEP","CHARGING_START","CHARGING_END","FORK_RAISE","FORK_LOWER","JACK_CHANGE","RELOC","BLOCKED_ON","BLOCKED_OFF","EMERGENCY_ON","EMERGENCY_OFF","ENTER_ZONE","EXIT_ZONE","STATION_CHANGE","MAP_CHANGE"];

const PRIMITIVE_LABELS: Record<string, string> = {
  MOVE_START: "开始移动", MOVE_END: "停止移动",
  REVERSE: "倒车/调头", TURN: "转弯", CREEP: "蠕行",
  CHARGING_START: "开始充电", CHARGING_END: "结束充电",
  FORK_RAISE: "货叉举升", FORK_LOWER: "货叉下降",
  JACK_CHANGE: "顶升变化", RELOC: "重定位",
  BLOCKED_ON: "受阻", BLOCKED_OFF: "解除受阻",
  EMERGENCY_ON: "急停触发", EMERGENCY_OFF: "急停解除",
  ENTER_ZONE: "进入区域", EXIT_ZONE: "离开区域",
  STATION_CHANGE: "站点切换", MAP_CHANGE: "地图切换",
};

const emptyRule = (): AgvActivityRule => ({
  name: "",
  activityType: "TRANSPORT",
  spatialCond: "",
  primitiveCond: "[]",
  stateCond: "",
  minDurationSec: undefined as any,
  maxDurationSec: undefined as any,
  priority: 5,
  confidenceBase: 0.8,
  enabled: true,
});

export default function AgvRulePanel() {
  const { data: rules = [], isLoading, isError, error } = useRules();
  const saveMut = useSaveRule();
  const toggleMut = useToggleRule();
  const [editing, setEditing] = useState<AgvActivityRule | null>(null);
  const [selectedPrimitives, setSelectedPrimitives] = useState<string[]>([]);

  const startEditing = (r: AgvActivityRule) => {
    setEditing(r);
    // Parse primitiveCond for the checkbox UI
    try {
      const parsed = r.primitiveCond ? JSON.parse(r.primitiveCond) : [];
      setSelectedPrimitives(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSelectedPrimitives([]);
    }
  };

  const updatePrimitiveCond = (prim: string) => {
    const next = selectedPrimitives.includes(prim)
      ? selectedPrimitives.filter(p => p !== prim)
      : [...selectedPrimitives, prim];
    setSelectedPrimitives(next);
    setEditing(prev => prev ? { ...prev, primitiveCond: JSON.stringify(next) } : null);
  };

  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="shrink-0 px-1 pb-2 border-b border-[var(--app-color-border-default)]">
        <button onClick={() => startEditing(emptyRule())}
          className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-full bg-[var(--app-color-accent)] text-white text-[10px] font-medium hover:opacity-90">
          <Plus size={11} /> 新建规则
        </button>
      </div>

      {/* Mutation errors */}
      {toggleMut.isError && (
        <div className="shrink-0 px-2 py-1.5 text-[9px] text-red-500 border-b border-[var(--app-color-border-default)]">
          切换规则失败: {toggleMut.error?.message || "未知错误"}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="text-center text-[var(--app-color-text-tertiary)] py-8">加载中...</div>
        ) : isError ? (
          <div className="text-center py-8 px-2">
            <AlertTriangle size={20} className="mx-auto mb-2 text-red-500" />
            <div className="text-[11px] text-red-500 font-medium mb-1">加载失败</div>
            <div className="text-[10px] text-[var(--app-color-text-tertiary)] break-all">
              {error?.message || "未知错误"}
            </div>
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center text-[var(--app-color-text-tertiary)] py-8">
            暂无规则。<br />点击"新建规则"创建第一条。
          </div>
        ) : rules.map(r => (
          <div key={r.id} className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]">
            <button onClick={() => r.id && toggleMut.mutate({ id: r.id, enabled: r.enabled ? 0 : 1 })}
              className={`relative w-6 h-3 rounded-full transition-colors shrink-0 ${r.enabled ? "bg-[var(--app-color-accent)]" : "bg-[var(--app-color-border-default)]"}`}>
              <span className={`absolute top-0.5 w-2 h-2 rounded-full bg-white shadow transition-all ${r.enabled ? "left-3.5" : "left-0.5"}`} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] truncate">#{r.id} {r.name}</div>
              <div className="text-[9px] text-[var(--app-color-text-tertiary)]">
                {ACTIVITY_LABELS[r.activityType] || r.activityType} · 优先级 {r.priority} · 置信度 {r.confidenceBase}
              </div>
            </div>
            <button onClick={() => startEditing(r)} className="p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)]"><Settings2 size={10} /></button>
          </div>
        ))}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="shrink-0 border-t border-[var(--app-color-border-default)] p-2 space-y-1.5 bg-[var(--app-color-surface-container)] max-h-[60%] overflow-auto">
          {/* Name */}
          <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
            placeholder="规则名称" className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />

          {/* Activity type */}
          <label className="block">
            <span className="text-[9px] text-[var(--app-color-text-tertiary)]">活动类型</span>
            <select value={editing.activityType} onChange={e => setEditing({ ...editing, activityType: e.target.value })}
              className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]">
              {Object.entries(ACTIVITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>

          {/* Priority + ConfidenceBase row */}
          <div className="flex gap-1">
            <label className="flex-1">
              <span className="text-[9px] text-[var(--app-color-text-tertiary)]">优先级</span>
              <input type="number" value={editing.priority} onChange={e => setEditing({ ...editing, priority: parseInt(e.target.value) || 5 })}
                className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
            </label>
            <label className="flex-1">
              <span className="text-[9px] text-[var(--app-color-text-tertiary)]">置信度</span>
              <input type="number" step="0.01" min="0" max="1" value={editing.confidenceBase} onChange={e => setEditing({ ...editing, confidenceBase: parseFloat(e.target.value) || 0.8 })}
                className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
            </label>
          </div>

          {/* Duration row */}
          <div className="flex gap-1">
            <label className="flex-1">
              <span className="text-[9px] text-[var(--app-color-text-tertiary)]">最短(秒)</span>
              <input type="number" value={editing.minDurationSec ?? ""} onChange={e => setEditing({ ...editing, minDurationSec: e.target.value ? parseInt(e.target.value) : undefined as any })}
                className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
            </label>
            <label className="flex-1">
              <span className="text-[9px] text-[var(--app-color-text-tertiary)]">最长(秒)</span>
              <input type="number" value={editing.maxDurationSec ?? ""} onChange={e => setEditing({ ...editing, maxDurationSec: e.target.value ? parseInt(e.target.value) : undefined as any })}
                className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
            </label>
          </div>

          {/* spatialCond - JSON textarea */}
          <label className="block">
            <span className="text-[9px] text-[var(--app-color-text-tertiary)]">空间条件 (spatialCond JSON)</span>
            <textarea value={editing.spatialCond || ""} onChange={e => setEditing({ ...editing, spatialCond: e.target.value })}
              placeholder='{"zone_tags":["充电"],"station_regex":"CP.*"}'
              rows={2}
              className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[10px] resize-y font-mono" />
          </label>

          {/* stateCond - JSON textarea */}
          <label className="block">
            <span className="text-[9px] text-[var(--app-color-text-tertiary)]">状态条件 (stateCond JSON)</span>
            <textarea value={editing.stateCond || ""} onChange={e => setEditing({ ...editing, stateCond: e.target.value })}
              placeholder='{"charging":true,"task_status":4}'
              rows={2}
              className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[10px] resize-y font-mono" />
          </label>

          {/* primitiveCond - checkbox grid */}
          <div>
            <div className="text-[9px] text-[var(--app-color-text-tertiary)] mb-0.5">触发原语 (primitiveCond)</div>
            <div className="flex flex-wrap gap-0.5 max-h-24 overflow-auto">
              {PRIMITIVE_OPTIONS.map(prim => {
                const active = selectedPrimitives.includes(prim);
                return (
                  <button key={prim} onClick={() => updatePrimitiveCond(prim)}
                    className={`px-1.5 py-0.5 rounded text-[8px] border transition-colors ${active ? "bg-[var(--app-color-accent)] text-white border-[var(--app-color-accent)]" : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]"}`}>
                    {PRIMITIVE_LABELS[prim] || prim}
                  </button>
                );
              })}
            </div>
          </div>

          {saveMut.isError && (
            <div className="text-[9px] text-red-500">保存失败: {saveMut.error?.message || "未知错误"}</div>
          )}

          <div className="flex gap-1">
            <button onClick={() => { saveMut.mutate(editing, { onSuccess: () => setEditing(null) }); }}
              disabled={saveMut.isPending}
              className="flex-1 px-2 py-1.5 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] text-white text-[10px] disabled:opacity-50">
              {saveMut.isPending ? "保存中..." : "保存"}
            </button>
            <button onClick={() => setEditing(null)}
              className="px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] text-[10px] text-[var(--app-color-text-tertiary)]">
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
