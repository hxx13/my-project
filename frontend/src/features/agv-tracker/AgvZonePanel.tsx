import { useState } from "react";
import { useSpatialElements, useSaveSpatialElement, useDeleteSpatialElement, useAutoGenerateZones, type AgvSpatialElement } from "@/api/domains/agv-analysis.api";
import { Plus, Download, Edit3, Trash2, MapPin, AlertTriangle } from "lucide-react";

const TAG_OPTIONS = ["充电", "作业", "通道", "路径", "等待"];
const ELEMENT_TYPES = [
  { value: "STATION_ZONE", label: "站点区域" },
  { value: "POLYGON_ZONE", label: "多边形区域" },
  { value: "POI", label: "兴趣点" },
  { value: "STATION_PATTERN", label: "站点模式" },
] as const;

export default function AgvZonePanel() {
  const { data: zones = [], isLoading, isError, error } = useSpatialElements();
  const saveMut = useSaveSpatialElement();
  const deleteMut = useDeleteSpatialElement();
  const autoGen = useAutoGenerateZones();

  const [editing, setEditing] = useState<AgvSpatialElement | null>(null);
  const [candidates, setCandidates] = useState<AgvSpatialElement[] | null>(null);

  const handleAutoGenerate = async () => {
    const result = await autoGen.mutateAsync(undefined);
    setCandidates(result);
  };

  const handleImportCandidate = async (c: AgvSpatialElement) => {
    c.isActive = true;
    try {
      await saveMut.mutateAsync(c);
      // Only filter candidate from list on SUCCESS
      setCandidates(prev => prev?.filter(x => x.stationPattern !== c.stationPattern) ?? null);
    } catch {
      // save failed — candidate stays in list for retry
      console.error("导入区域失败:", c.name);
    }
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
        <button onClick={handleAutoGenerate} disabled={autoGen.isPending}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-full bg-[var(--app-color-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-50">
          <Download size={11} /> 自动生成
        </button>
        <button onClick={() => setEditing(emptyElement())}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-full border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] text-[10px] hover:bg-[var(--app-color-surface-hover)]">
          <Plus size={11} /> 手动
        </button>
      </div>

      {/* Error from auto-generate */}
      {autoGen.isError && (
        <div className="shrink-0 px-2 py-1.5 text-[9px] text-red-500 border-b border-[var(--app-color-border-default)]">
          自动生成失败: {autoGen.error?.message || "未知错误"}
        </div>
      )}
      {deleteMut.isError && (
        <div className="shrink-0 px-2 py-1.5 text-[9px] text-red-500 border-b border-[var(--app-color-border-default)]">
          删除失败: {deleteMut.error?.message || "未知错误"}
        </div>
      )}

      {/* Candidates from auto-generate */}
      {candidates && candidates.length > 0 && (
        <div className="shrink-0 p-1.5 border-b border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]">
          <div className="text-[9px] text-[var(--app-color-text-tertiary)] mb-1 uppercase tracking-wide">候选区域 ({candidates.length})</div>
          <div className="max-h-32 overflow-auto space-y-0.5">
            {candidates.map(c => (
              <div key={c.stationPattern} className="flex items-center gap-1 px-1.5 py-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)]">
                <MapPin size={10} className="text-[var(--app-color-text-tertiary)]" />
                <span className="flex-1 text-[10px]">{c.name}</span>
                <span className="text-[9px] text-[var(--app-color-text-tertiary)]">{c.mapName}</span>
                <button onClick={() => handleImportCandidate(c)}
                  disabled={saveMut.isPending}
                  className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--app-color-accent)] text-white hover:opacity-90 disabled:opacity-50">
                  导入
                </button>
              </div>
            ))}
          </div>
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
        ) : zones.length === 0 && (!candidates || candidates.length === 0) ? (
          <div className="text-center text-[var(--app-color-text-tertiary)] py-8">
            暂无区域。<br />点击"自动生成"或"手动"创建。
          </div>
        ) : zones.map(zone => (
          <div key={zone.id} className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: zone.color || "#3b82f6" }} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] truncate">{zone.name}</div>
              <div className="text-[9px] text-[var(--app-color-text-tertiary)]">{zone.mapName}{zone.stationPattern ? ` · ${zone.stationPattern}` : ""} · {ELEMENT_TYPES.find(t => t.value === zone.elementType)?.label || zone.elementType}</div>
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
