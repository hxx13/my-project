import { useState, useEffect } from "react";
import { useSpatialElements, useSaveSpatialElement, useDeleteSpatialElement, useDiscoverZones, type AgvSpatialElement } from "@/api/domains/agv-analysis.api";
import { Plus, Edit3, Trash2, AlertTriangle, Search, Crosshair } from "lucide-react";

const TAG_OPTIONS = ["充电", "作业", "等待", "休息站", "运输", "倒车"];
// 标签 → 颜色映射（与后端 inferColorByTag 保持一致）
const TAG_COLORS: Record<string, string> = {
  "充电": "#22c55e",
  "作业": "#f59e0b",
  "等待": "#f97316",
  "休息站": "#14b8a6",
  "运输": "#3b82f6",
  "倒车": "#ec4899",
};
// 以 (cx, cy) 为中心生成小菱形 polygon，边长 ≈1.6m，canvas 可渲染
function makeDiamondPolygon(cx: number, cy: number): string {
  const d = 0.8;
  return JSON.stringify([[cx, cy + d], [cx + d, cy], [cx, cy - d], [cx - d, cy]]);
}
const ELEMENT_TYPES = [
  { value: "STATION_ZONE", label: "站点区域" },
  { value: "POLYGON_ZONE", label: "多边形区域" },
  { value: "POI", label: "兴趣点" },
  { value: "STATION_PATTERN", label: "站点模式" },
] as const;

interface Props {
  onRequestPick?: () => void;
  pendingPick?: { x: number; y: number } | null;
  onClearPick?: () => void;
}

export default function AgvZonePanel({ onRequestPick, pendingPick, onClearPick }: Props) {
  const { data: zones = [], isLoading, isError, error } = useSpatialElements();
  const saveMut = useSaveSpatialElement();
  const deleteMut = useDeleteSpatialElement();
  const discoverMut = useDiscoverZones();

  const [editing, setEditing] = useState<AgvSpatialElement | null>(null);
  // 快捷标记：选点后直接选标签保存，不用进全量编辑表单
  const [quickPick, setQuickPick] = useState<{ x: number; y: number } | null>(null);

  // 当从地图选点返回时，进入快捷标签选择模式
  useEffect(() => {
    if (pendingPick) {
      setQuickPick({ x: pendingPick.x, y: pendingPick.y });
      onClearPick?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPick]);

  const handleQuickSave = (tag: string) => {
    if (!quickPick) return;
    const { x, y } = quickPick;
    const color = TAG_COLORS[tag] || "#3b82f6";
    const element: AgvSpatialElement = {
      name: `${tag}标记`,
      elementType: "POLYGON_ZONE",
      polygonJson: makeDiamondPolygon(x, y),
      semanticTags: JSON.stringify([tag]),
      mapName: "",
      color,
    };
    saveMut.mutate(element, { onSuccess: () => setQuickPick(null) });
  };

  const handleDelete = (id: number) => {
    if (window.confirm("确定要删除此区域吗？")) {
      deleteMut.mutate(id);
    }
  };

  const emptyElement = (): AgvSpatialElement => ({
    name: "",
    elementType: "STATION_ZONE",
    semanticTags: "[]",
    mapName: "",
    color: "#3b82f6",
  });

  return (
    <div className="flex flex-col h-full text-[11px]">
      <div className="shrink-0 flex gap-1.5 px-1 pb-2 border-b border-[var(--app-color-border-default)]">
        <button onClick={() => discoverMut.mutate(undefined)} disabled={discoverMut.isPending}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-full bg-[var(--app-color-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-50"
          title="从近期行为数据中聚类发现充电/作业/休息区域">
          <Search size={11} /> {discoverMut.isPending ? "发现中..." : "发现区域"}
        </button>
        <button onClick={() => setEditing(emptyElement())}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-full border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] text-[10px] hover:bg-[var(--app-color-surface-hover)]">
          <Plus size={11} /> 手动
        </button>
        <button onClick={() => onRequestPick?.()}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-full bg-[var(--app-color-accent)] text-white text-[10px] font-medium hover:opacity-90"
          title="隐藏窗口，在地图上点击标记位置">
          <Crosshair size={11} /> 地图标记
        </button>
      </div>
      {/* 快捷标签选择器：地图选点后直接选标签保存 */}
      {quickPick && (
        <div className="shrink-0 px-2 py-2 border-b border-[var(--app-color-border-default)] space-y-1.5 bg-[var(--app-color-accent-soft)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--app-color-text-secondary)]">
              已标记坐标 <span className="font-mono font-semibold text-[var(--app-color-text-primary)]">
                ({quickPick.x.toFixed(2)}, {quickPick.y.toFixed(2)})
              </span>
            </span>
            <button onClick={() => setQuickPick(null)}
              className="text-[9px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">
              取消
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {TAG_OPTIONS.map(tag => (
              <button key={tag}
                onClick={() => handleQuickSave(tag)}
                disabled={saveMut.isPending}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: TAG_COLORS[tag] || "#3b82f6" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Discover result */}
      {discoverMut.isSuccess && discoverMut.data && (
        <div className="shrink-0 px-2 py-1 text-[10px] border-b border-[var(--app-color-border-default)]">
          <span className={discoverMut.data.zonesCreatedOrUpdated > 0 ? "text-green-600" : "text-[var(--app-color-text-tertiary)]"}>
            分析 {discoverMut.data.segmentsAnalyzed} 个活动段 → 发现/更新 {discoverMut.data.zonesCreatedOrUpdated} 个区域
          </span>
        </div>
      )}
      {discoverMut.isError && (
        <div className="shrink-0 px-2 py-1.5 text-[9px] text-red-500 border-b border-[var(--app-color-border-default)]">
          发现失败: {discoverMut.error?.message || "未知错误"}
        </div>
      )}

      {deleteMut.isError && (
        <div className="shrink-0 px-2 py-1.5 text-[9px] text-red-500 border-b border-[var(--app-color-border-default)]">
          删除失败: {deleteMut.error?.message || "未知错误"}
        </div>
      )}

      {/* Zone list */}
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
        ) : zones.length === 0 ? (
          <div className="text-center text-[var(--app-color-text-tertiary)] py-8">
            暂无区域。<br />点击"发现区域"从行为数据中聚类发现，或"手动"创建。
          </div>
        ) : zones.map(zone => (
          <div key={zone.id} className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color || "#3b82f6" }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] truncate">{zone.name}</span>
                {zone.source && (
                  <span className={`text-[7px] px-1 rounded-full font-medium ${
                    zone.source === "BEHAVIOR" ? "bg-purple-100 text-purple-600" :
                    zone.source === "MANUAL" ? "bg-blue-100 text-blue-600" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {zone.source === "BEHAVIOR" ? "行为" : zone.source === "MANUAL" ? "手动" : "导入"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="text-[9px] text-[var(--app-color-text-tertiary)]">{zone.mapName}{zone.stationPattern ? ` · ${zone.stationPattern}` : ""}</div>
                {zone.confidence != null && (
                  <div className="flex items-center gap-0.5">
                    <div className="w-8 h-1 rounded-full bg-[var(--app-color-border-default)] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${(zone.confidence * 100).toFixed(0)}%`,
                        backgroundColor: zone.confidence >= 0.8 ? "#22c55e" : zone.confidence >= 0.5 ? "#f59e0b" : "#ef4444"
                      }} />
                    </div>
                    <span className="text-[8px] text-[var(--app-color-text-tertiary)] tabular-nums">{(zone.confidence * 100).toFixed(0)}%</span>
                  </div>
                )}
                {zone.hitCount != null && zone.hitCount > 0 && (
                  <span className="text-[8px] text-[var(--app-color-text-tertiary)]">{zone.hitCount}次</span>
                )}
              </div>
            </div>
            {zone.semanticTags && (() => {
              try {
                const tags: string[] = JSON.parse(zone.semanticTags);
                if (!tags.length) return null;
                return (
                  <div className="flex gap-0.5">
                    {tags.map((t: string) => (
                      <span key={t} className="px-1 rounded text-[8px] bg-[var(--app-color-surface-page)] text-[var(--app-color-text-tertiary)]">{t}</span>
                    ))}
                  </div>
                );
              } catch { return null; }
            })()}
            <button onClick={() => setEditing(zone)} className="p-0.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)]"><Edit3 size={10} /></button>
            <button onClick={() => zone.id && handleDelete(zone.id)} className="p-0.5 text-[var(--app-color-text-tertiary)] hover:text-red-500"><Trash2 size={10} /></button>
          </div>
        ))}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="shrink-0 border-t border-[var(--app-color-border-default)] p-2 space-y-1.5 bg-[var(--app-color-surface-container)] max-h-[60%] overflow-auto">
          <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
            placeholder="名称" className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />

          <div className="flex gap-1">
            <input value={editing.mapName || ""} onChange={e => setEditing({ ...editing, mapName: e.target.value })}
              placeholder="地图" className="flex-1 px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
            <input value={editing.stationPattern || ""} onChange={e => setEditing({ ...editing, stationPattern: e.target.value })}
              placeholder="站点" className="flex-1 px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
          </div>

          {/* elementType selector */}
          <label className="block">
            <span className="text-[9px] text-[var(--app-color-text-tertiary)]">元素类型</span>
            <select value={editing.elementType} onChange={e => setEditing({ ...editing, elementType: e.target.value as AgvSpatialElement["elementType"] })}
              className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]">
              {ELEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          {/* polygonJson textarea — shown for POLYGON_ZONE */}
          {(editing.elementType === "POLYGON_ZONE" || editing.elementType === "STATION_ZONE") && (
            <label className="block">
              <span className="text-[9px] text-[var(--app-color-text-tertiary)]">多边形坐标 (JSON)</span>
              <textarea value={editing.polygonJson || ""} onChange={e => setEditing({ ...editing, polygonJson: e.target.value })}
                placeholder='[{"x":1,"y":2},{"x":3,"y":4}]'
                rows={2}
                className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[10px] resize-y" />
            </label>
          )}

          {/* POI fields — shown for POI */}
          {editing.elementType === "POI" && (
            <div className="space-y-1">
              <div className="flex gap-1">
                <label className="flex-1">
                  <span className="text-[9px] text-[var(--app-color-text-tertiary)]">POI X</span>
                  <input type="number" step="any" value={editing.poiX ?? ""} onChange={e => setEditing({ ...editing, poiX: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
                </label>
                <label className="flex-1">
                  <span className="text-[9px] text-[var(--app-color-text-tertiary)]">POI Y</span>
                  <input type="number" step="any" value={editing.poiY ?? ""} onChange={e => setEditing({ ...editing, poiY: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
                </label>
              </div>
              <label className="block">
                <span className="text-[9px] text-[var(--app-color-text-tertiary)]">半径 (m)</span>
                <input type="number" step="any" value={editing.poiRadiusM ?? ""} onChange={e => setEditing({ ...editing, poiRadiusM: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="1.0"
                  className="w-full px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
              </label>
            </div>
          )}

          {/* color input */}
          <label className="block">
            <span className="text-[9px] text-[var(--app-color-text-tertiary)]">颜色</span>
            <div className="flex gap-1">
              <input type="color" value={editing.color || "#3b82f6"} onChange={e => setEditing({ ...editing, color: e.target.value })}
                className="w-8 h-8 rounded border border-[var(--app-color-border-default)] cursor-pointer" />
              <input value={editing.color || ""} onChange={e => setEditing({ ...editing, color: e.target.value })}
                placeholder="#3b82f6" className="flex-1 px-2 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px]" />
            </div>
          </label>

          {/* Tags */}
          <div>
            <div className="text-[9px] text-[var(--app-color-text-tertiary)] mb-0.5">语义标签</div>
            <div className="flex flex-wrap gap-1">
              {TAG_OPTIONS.map(t => {
                let tags: string[] = [];
                try { tags = editing.semanticTags ? JSON.parse(editing.semanticTags) : []; } catch { tags = []; }
                const active = tags.includes(t);
                return (
                  <button key={t} onClick={() => {
                    const next = active ? tags.filter(x => x !== t) : [...tags, t];
                    setEditing({ ...editing, semanticTags: JSON.stringify(next) });
                  }} className={`px-2 py-0.5 rounded-full text-[9px] border transition-colors ${active ? "bg-[var(--app-color-accent)] text-white border-[var(--app-color-accent)]" : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]"}`}>
                    {t}
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
