import { useState, useEffect } from "react";
import { useSpatialElements, useSaveSpatialElement, useDeleteSpatialElement, useDiscoverZones, useGenerateZonesFromTopology, type AgvSpatialElement } from "@/api/domains/agv-analysis.api";
import { Plus, Edit3, Trash2, AlertTriangle, Search, Crosshair, Sparkles } from "lucide-react";
import { BUILTIN_TAG_OPTIONS, BUILTIN_TAG_COLORS } from "@/features/agv-tracker/tagConfig";

const TAG_OPTIONS = [...BUILTIN_TAG_OPTIONS];
const TAG_COLORS: Record<string, string> = { ...BUILTIN_TAG_COLORS };
// 两点式矩形：以 (x1,y1) 和 (x2,y2) 为对角角点，生成矩形 polygon
export function makeRectPolygon(x1: number, y1: number, x2: number, y2: number): string {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  return JSON.stringify([[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]);
}
// 单点退化（无第二角点时兜底）：以 (cx, cy) 为中心生成小菱形
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

type QuickPick = { x: number; y: number } | { x1: number; y1: number; x2: number; y2: number };
type PendingPick = { x: number; y: number } | { x1: number; y1: number; x2: number; y2: number };

function isRectPick(p: QuickPick): p is { x1: number; y1: number; x2: number; y2: number } {
  return 'x1' in p;
}

interface Props {
  onRequestPick?: () => void;
  onRequestRectPick?: () => void;
  pendingPick?: PendingPick | null;
  onClearPick?: () => void;
  focusZoneId?: number | null;
  creatableTags?: string[];
  allTagColors?: Record<string, string>;
}

export default function AgvZonePanel({ onRequestPick, onRequestRectPick, pendingPick, onClearPick, focusZoneId, creatableTags, allTagColors }: Props) {
  const { data: zones = [], isLoading, isError, error } = useSpatialElements();
  const saveMut = useSaveSpatialElement();
  const deleteMut = useDeleteSpatialElement();
  const discoverMut = useDiscoverZones();
  const topoGenMut = useGenerateZonesFromTopology();

  const [editing, setEditing] = useState<AgvSpatialElement | null>(null);
  // 快捷标记：选点后直接选标签保存（单点 / 两点矩形）
  const [quickPick, setQuickPick] = useState<QuickPick | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);

  // 从画布点击标签编辑 → 自动选中对应区域
  useEffect(() => {
    if (focusZoneId != null && zones.length > 0) {
      const z = zones.find(item => item.id === focusZoneId);
      if (z) setEditing(z);
    }
  }, [focusZoneId, zones]);

  // 当从地图选点返回时，进入快捷标签选择模式
  useEffect(() => {
    if (pendingPick) {
      if ('x1' in pendingPick) {
        setQuickPick({ x1: pendingPick.x1, y1: pendingPick.y1, x2: pendingPick.x2, y2: pendingPick.y2 });
      } else {
        setQuickPick({ x: pendingPick.x, y: pendingPick.y });
      }
      onClearPick?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPick]);

  const handleQuickSave = (tag: string) => {
    if (!quickPick) return;
    const color = (allTagColors ?? TAG_COLORS)[tag] || "#3b82f6";
    const polygonJson = isRectPick(quickPick)
      ? makeRectPolygon(quickPick.x1, quickPick.y1, quickPick.x2, quickPick.y2)
      : makeDiamondPolygon(quickPick.x, quickPick.y);
    const element: AgvSpatialElement = {
      name: `${tag}标记`,
      elementType: "POLYGON_ZONE",
      polygonJson,
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
        <button onClick={() => topoGenMut.mutate()} disabled={topoGenMut.isPending}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-full border border-[var(--app-color-accent)] text-[var(--app-color-accent)] text-[10px] font-medium hover:bg-[var(--app-color-accent-soft)] disabled:opacity-50"
          title="从路线拓扑数据生成区域（复用路线频次和标签，质量更高）">
          <Sparkles size={11} /> {topoGenMut.isPending ? "生成中..." : "拓扑生成"}
        </button>
        <button onClick={() => setEditing(emptyElement())}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-full border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] text-[10px] hover:bg-[var(--app-color-surface-hover)]">
          <Plus size={11} /> 手动
        </button>
        <button onClick={() => onRequestPick?.()}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-full bg-[var(--app-color-accent)] text-white text-[10px] font-medium hover:opacity-90"
          title="隐藏窗口，在地图上点击标记位置">
          <Crosshair size={11} /> 标记
        </button>
        <button onClick={() => onRequestRectPick?.()}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-full border border-[var(--app-color-accent)] text-[var(--app-color-accent)] text-[10px] font-medium hover:bg-[var(--app-color-accent-soft)]"
          title="隐藏窗口，在地图上点击两个角点绘制矩形区域">
          <Crosshair size={11} /> 矩形
        </button>
      </div>
      {/* 快捷标签选择器：地图选点后直接选标签保存 */}
      {quickPick && (
        <div className="shrink-0 px-2 py-2 border-b border-[var(--app-color-border-default)] space-y-1.5 bg-[var(--app-color-accent-soft)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--app-color-text-secondary)]">
              {isRectPick(quickPick) ? (
                <>矩形区域 <span className="font-mono font-semibold text-[var(--app-color-text-primary)]">
                  ({quickPick.x1.toFixed(2)},{quickPick.y1.toFixed(2)}) → ({quickPick.x2.toFixed(2)},{quickPick.y2.toFixed(2)})
                </span></>
              ) : (
                <>已标记坐标 <span className="font-mono font-semibold text-[var(--app-color-text-primary)]">
                  ({quickPick.x.toFixed(2)}, {quickPick.y.toFixed(2)})
                </span></>
              )}
            </span>
            <button onClick={() => setQuickPick(null)}
              className="text-[9px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">
              取消
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(creatableTags ?? TAG_OPTIONS).map(tag => (
              <button key={tag}
                onClick={() => handleQuickSave(tag)}
                disabled={saveMut.isPending}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: (allTagColors ?? TAG_COLORS)[tag] || "#3b82f6" }}>
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

      {/* 标签筛选 + 来源分类 + 批量操作 */}
      {zones.length > 0 && (
        <TagsFilterBar zones={zones} activeTag={activeTag} onSetActiveTag={setActiveTag} activeSource={activeSource} onSetActiveSource={setActiveSource} allTagColors={allTagColors} onDeleteByTag={(tag) => {
          const ids = zones.filter(z => {
            try { const tags: string[] = JSON.parse(z.semanticTags || "[]"); return tags.includes(tag); } catch { return false; }
          }).map(z => z.id!);
          if (ids.length > 0 && window.confirm(`确定删除所有「${tag}」标签区域 (${ids.length}个)？`)) {
            ids.forEach(id => deleteMut.mutate(id));
          }
        }} onDeleteBySource={(source) => {
          const ids = zones.filter(z => z.source === source).map(z => z.id!);
          if (ids.length > 0 && window.confirm(`确定删除所有来源「${source}」区域 (${ids.length}个)？`)) {
            ids.forEach(id => deleteMut.mutate(id));
          }
        }} />
      )}

      {/* Zone list */}
      <div className="flex-1 overflow-auto">
        {(() => {
          const filtered = zones.filter(z => {
            if (activeTag) {
              try { const tags: string[] = JSON.parse(z.semanticTags || "[]"); if (!tags.includes(activeTag)) return false; } catch { return false; }
            }
            if (activeSource && z.source !== activeSource) return false;
            return true;
          });
          if (isLoading) return <div className="text-center text-[var(--app-color-text-tertiary)] py-8">加载中...</div>;
          if (isError) return (
            <div className="text-center py-8 px-2">
              <AlertTriangle size={20} className="mx-auto mb-2 text-red-500" />
              <div className="text-[11px] text-red-500 font-medium mb-1">加载失败</div>
              <div className="text-[10px] text-[var(--app-color-text-tertiary)] break-all">{error?.message || "未知错误"}</div>
            </div>
          );
          if (filtered.length === 0) return <div className="text-center text-[var(--app-color-text-tertiary)] py-8">暂无匹配区域</div>;
          return filtered.map(zone => (
          <div key={zone.id} className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color || "#3b82f6" }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] truncate">{zone.name}</span>
                {zone.source && (
                  <span className={`text-[7px] px-1 rounded-full font-medium ${
                    zone.source === "BEHAVIOR" ? "bg-purple-100 text-purple-600" :
                    zone.source === "MANUAL" ? "bg-blue-100 text-blue-600" :
                    zone.source === "TOPOLOGY" ? "bg-green-100 text-green-600" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {zone.source === "BEHAVIOR" ? "行为" : zone.source === "MANUAL" ? "手动" : zone.source === "TOPOLOGY" ? "拓扑" : "导入"}
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
        ));
        })()}
      </div>

      {/* Edit form */}
      {editing && (
        <div ref={(el) => { if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" }); }}
          className="shrink-0 border-t border-[var(--app-color-border-default)] p-2 space-y-1.5 bg-[var(--app-color-surface-container)] max-h-[60%] overflow-auto">
          {/* 快速任务类型切换 */}
          <div className="flex items-center gap-1">
          {editing.robotIp && (
            <span className="text-[9px] text-[var(--app-color-text-tertiary)] shrink-0 mr-1">
              归属: <span className="font-semibold text-[var(--app-color-text-primary)]">
                {editing.robotIp.endsWith(".16") ? "AGV-1" : editing.robotIp.endsWith(".18") ? "AGV-2" : editing.robotIp.endsWith(".20") ? "AGV-3" : "AGV-4"}
              </span>
            </span>
          )}
            <span className="text-[9px] text-[var(--app-color-text-tertiary)] shrink-0">快捷任务:</span>
            {(creatableTags ?? TAG_OPTIONS).map(tag => (
              <button key={tag} onClick={() => setEditing(prev => {
                if (!prev) return prev;
                const tags = [tag]; // 单选替换
                return { ...prev, semanticTags: JSON.stringify(tags), color: (allTagColors ?? TAG_COLORS)[tag] || prev.color };
              })}
                className="px-1.5 py-0.5 rounded-full text-[9px] font-medium text-white hover:opacity-90"
                style={{ backgroundColor: (allTagColors ?? TAG_COLORS)[tag] || "#3b82f6" }}>
                {tag}
              </button>
            ))}
            <button onClick={() => setEditing(null)}
              className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]">✕ 关闭</button>
          </div>
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
              {(creatableTags ?? TAG_OPTIONS).map(t => {
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

/** 标签筛选 + 来源分类 + 批量删除组件 */
function TagsFilterBar({ zones, activeTag, onSetActiveTag, activeSource, onSetActiveSource, onDeleteByTag, onDeleteBySource, allTagColors }: {
  zones: AgvSpatialElement[];
  activeTag: string | null; onSetActiveTag: (t: string | null) => void;
  activeSource: string | null; onSetActiveSource: (s: string | null) => void;
  onDeleteByTag: (tag: string) => void;
  onDeleteBySource: (source: string) => void;
  allTagColors?: Record<string, string>;
}) {

  // 统计各标签数量
  const tagCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  for (const z of zones) {
    try { const tags: string[] = JSON.parse(z.semanticTags || "[]"); for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1; } catch {}
    const s = z.source || "未知";
    sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  }

  const allTags = Object.keys(tagCounts).sort((a, b) => (tagCounts[b] || 0) - (tagCounts[a] || 0));
  const allSources = Object.keys(sourceCounts).sort();
  const SOURCE_LABELS: Record<string, string> = { BEHAVIOR: "行为", MANUAL: "手动", AUTO: "自动", TOPOLOGY: "拓扑" };

  return (
    <div className="shrink-0 px-2 py-1.5 border-b border-[var(--app-color-border-default)] space-y-1">
      {/* 标签行 */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] text-[var(--app-color-text-tertiary)] shrink-0">标签:</span>
        <button onClick={() => onSetActiveTag(null)}
          className={`px-1.5 py-0.5 rounded-full text-[9px] ${!activeTag ? "bg-[var(--app-color-accent)] text-white" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"}`}>
          全部({zones.length})
        </button>
        {allTags.map(tag => (
          <button key={tag} onClick={() => onSetActiveTag(activeTag === tag ? null : tag)}
            className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeTag === tag ? "text-white" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"}`}
            style={activeTag === tag ? { backgroundColor: (allTagColors ?? TAG_COLORS)[tag] || "#3b82f6" } : {}}>
            {tag}({tagCounts[tag]})
          </button>
        ))}
        {activeTag && (
          <button onClick={() => onDeleteByTag(activeTag)}
            className="px-1.5 py-0.5 rounded-full text-[9px] text-red-500 hover:bg-red-50">🗑 删此标签</button>
        )}
      </div>
      {/* 来源行 */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[9px] text-[var(--app-color-text-tertiary)] shrink-0">来源:</span>
        <button onClick={() => onSetActiveSource(null)}
          className={`px-1.5 py-0.5 rounded-full text-[9px] ${!activeSource ? "bg-[var(--app-color-accent)] text-white" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"}`}>
          全部
        </button>
        {allSources.map(src => (
          <button key={src} onClick={() => onSetActiveSource(activeSource === src ? null : src)}
            className={`px-1.5 py-0.5 rounded-full text-[9px] ${activeSource === src ? "bg-[var(--app-color-accent)] text-white" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"}`}>
            {SOURCE_LABELS[src] || src}({sourceCounts[src]})
          </button>
        ))}
        {activeSource && (
          <button onClick={() => onDeleteBySource(activeSource)}
            className="px-1.5 py-0.5 rounded-full text-[9px] text-red-500 hover:bg-red-50">🗑 删此来源</button>
        )}
      </div>
    </div>
  );
}
