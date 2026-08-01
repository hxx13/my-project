import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgvConfigEntry } from "@/api/domains/agv.api";
import { fetchAgvConfig, updateAgvConfig, fetchCoordConfigs, updateCoordConfig } from "@/api/domains/agv.api";
import { Link } from "react-router-dom";
import { FileText, LayoutGrid, Maximize2, Settings2, BarChart3, RotateCw, Map, Route, Crosshair, Zap, SquareDashed, Edit3, ChevronDown, Plus, Trash2, Undo2 } from "lucide-react";
import { BUILTIN_TAG_OPTIONS, BUILTIN_TAG_COLORS, type CustomTag } from "@/features/agv-tracker/tagConfig";

const ROBOT_KEYS = ["AGV_ROBOT_16", "AGV_ROBOT_18", "AGV_ROBOT_20", "AGV_ROBOT_22"] as const;
const ROBOT_SHORT = [".16", ".18", ".20", ".22"] as const;
const ROBOT_NAMES = ["AGV-1", "AGV-2", "AGV-3", "AGV-4"] as const;
type LayoutMode = "quad" | "single";

interface Props {
  serverTime: string | null;
  layout: LayoutMode; onLayoutChange: (m: LayoutMode) => void;
  singleTab: number; onSingleTabChange: (i: number) => void;
  analysisOpen: boolean; onAnalysisToggle: () => void;
  showZones: boolean; onToggleZones: () => void;
  routeMode: boolean; onToggleRouteMode: () => void;
  followMode: boolean; onToggleFollowMode: () => void;
  coordEditMode?: boolean; onToggleCoordEditMode?: () => void;
  zoneEditMode?: boolean; onToggleZoneEditMode?: () => void;
  vehicleIcon: 'arrow'|'forklift'; onToggleVehicleIcon: () => void;
  /** 路线模型2：正在重新生成 */
  topologyGenerating?: boolean;
  /** 路线模型2：触发拓扑重新生成 */
  onGenerateTopology?: () => void;
  /** 地图上快速框选标记区域 */
  onStartRectPick?: () => void;
  /** 每台 AGV 的标签显隐配置 */
  hiddenTagsByIp?: Record<string, Set<string>>;
  onToggleHiddenTag?: (ip: string, tag: string) => void;
  /** 自定义标签 */
  customTags?: CustomTag[];
  onAddCustomTag?: (name: string, color: string, scope: "world" | "agv", agvIp?: string) => void;
  onDeleteCustomTag?: (id: string) => void;
  allTagColors?: Record<string, string>;
  creatableTags?: string[];
  /** 撤回 */
  undoLabel?: string | null;
  onUndo?: () => void;
  /** 坐标系配置保存/恢复 */
  onSaveCoordPreset?: () => void;
  onRestoreCoordPreset?: () => void;
  onResetCoordZero?: () => void;
  coordPresetSaved?: boolean;
}

export default function AgvSidebar({ serverTime, layout, onLayoutChange, singleTab, onSingleTabChange, analysisOpen, onAnalysisToggle, showZones, onToggleZones, routeMode, onToggleRouteMode, followMode, onToggleFollowMode, coordEditMode, onToggleCoordEditMode, zoneEditMode, onToggleZoneEditMode, vehicleIcon, onToggleVehicleIcon, topologyGenerating, onGenerateTopology, onStartRectPick, hiddenTagsByIp, onToggleHiddenTag, customTags, onAddCustomTag, onDeleteCustomTag, allTagColors, creatableTags, undoLabel, onUndo, onSaveCoordPreset, onRestoreCoordPreset, onResetCoordZero, coordPresetSaved }: Props) {
  const qc = useQueryClient();
  const [tagDropdownIp, setTagDropdownIp] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#f59e0b");
  const [newTagScope, setNewTagScope] = useState<"world" | "agv">("world");
  const { data: configs } = useQuery({ queryKey: ["agvConfig"], queryFn: fetchAgvConfig, refetchInterval: 30_000 });
  const { data: rotations } = useQuery({ queryKey: ["agvCoordConfigs"], queryFn: fetchCoordConfigs, staleTime: 60_000 });
  const master = configs?.find((c) => c.jobKey === "AGV_MASTER");
  const anyOnline = configs?.some((c) => c.jobKey.startsWith("AGV_ROBOT") && c.enabled);
  const masterOn = master?.enabled ?? false;

  const toggleRobot = async (jobKey: string, cur: boolean) => {
    const v = cur ? 0 : 1; await updateAgvConfig(jobKey, v);
    qc.setQueryData(["agvConfig"], (old: AgvConfigEntry[] | undefined) =>
      old?.map((c) => (c.jobKey === jobKey ? { ...c, enabled: !cur } : c)));
  };

  const rotateRobot = async (ip: string) => {
    const frame = rotations?.[ip];
    const cur = frame?.rotationDeg ?? 0;
    const next = ((cur + 90) % 360 + 360) % 360;
    await updateCoordConfig(ip, next, frame?.offsetX, frame?.offsetY);
    qc.setQueryData(["agvCoordConfigs"], (old: Record<string, any> | undefined) => {
      if (!old) return old;
      return { ...old, [ip]: { ...old[ip], rotationDeg: next } };
    });
  };

  const showSingleTabs = layout === "single";

  return (
    <>
    <style>{`
      .agv-sidebar-scroll::-webkit-scrollbar { height: 3px; }
      .agv-sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
      .agv-sidebar-scroll::-webkit-scrollbar-thumb { background: var(--app-color-accent); border-radius: 3px; }
    `}</style>
    <div
      className="agv-sidebar-scroll absolute -top-6 left-1/2 -translate-x-1/2 z-[var(--z-overlay)] flex flex-nowrap items-center gap-0.5 px-2 py-1 rounded-full bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-md overflow-x-auto max-w-[95vw] [&>*]:shrink-0"
      style={{ scrollbarWidth: "thin", scrollbarColor: "var(--app-color-accent) transparent" } as React.CSSProperties}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 mx-0.5 ${masterOn && anyOnline ? "bg-green-500" : masterOn ? "bg-yellow-500" : "bg-gray-400"}`} />
      <button onClick={() => onLayoutChange(layout === "quad" ? "single" : "quad")}
        className="px-2 py-0.5 rounded-full text-[10px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors flex items-center gap-1">
        {layout === "quad" ? <Maximize2 size={11} /> : <LayoutGrid size={11} />}
      </button>
      <span className="w-px h-3 bg-[var(--app-color-border-default)]" />

      <span className="w-px h-3 bg-[var(--app-color-border-default)]" />
      {showSingleTabs && ROBOT_SHORT.map((l, i) => (
        <button key={l} onClick={() => onSingleTabChange(i)}
          className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${i === singleTab ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}>{l}</button>
      ))}
      {showSingleTabs && <span className="w-px h-3 bg-[var(--app-color-border-default)]" />}

      {/* 每车标签显隐配置（下拉式） */}
      {hiddenTagsByIp && onToggleHiddenTag && (() => {
        const colors = allTagColors ?? BUILTIN_TAG_COLORS;
        const tags = creatableTags ?? [...BUILTIN_TAG_OPTIONS];
        return (
          <>
            {ROBOT_KEYS.map((key, i) => {
              const ip = `172.22.159.${16 + i * 2}`;
              const hidden = hiddenTagsByIp[ip] ?? new Set<string>();
              const isExpanded = tagDropdownIp === ip;
              const robotColor = ["#3b82f6","#22c55e","#f59e0b","#8b5cf6"][i];
              return (
                <span key={`tags-${key}`} className="flex items-center gap-0">
                  <button onClick={(e) => {
                    if (isExpanded) { setTagDropdownIp(null); setDropdownPos(null); }
                    else {
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setDropdownPos({ top: r.bottom + 4, left: r.left });
                      setTagDropdownIp(ip);
                    }
                  }}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap hover:bg-[var(--app-color-surface-hover)] transition-colors"
                    style={{ color: robotColor }}>
                    {ROBOT_NAMES[i]}
                    <ChevronDown size={9} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {/* 每车独立旋转按钮 */}
                  <button onClick={() => rotateRobot(ip)}
                    className="p-0.5 rounded-full text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-accent)]"
                    title={`旋转 ${ROBOT_NAMES[i]} 坐标系 (+90°)`}>
                    <RotateCw size={10} />
                  </button>
                </span>
              );
            })}
          </>
        );
      })()}
      <span className="w-px h-3 bg-[var(--app-color-border-default)]" />

      <Link to="/admin/agv-tracker/logs"
        className="px-2 py-0.5 rounded-full text-[10px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors flex items-center gap-1 whitespace-nowrap"><FileText size={11} />日志</Link>
      <Link to="/admin/agv-tracker/analytics"
        className="px-2 py-0.5 rounded-full text-[10px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors flex items-center gap-1 whitespace-nowrap"><BarChart3 size={11} />分析</Link>
      <button onClick={onToggleZones}
        className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center ${showZones ? "text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}
        title={showZones ? "隐藏区域框" : "显示区域框"}><Map size={11} /></button>
      <button onClick={onToggleRouteMode}
        className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center ${routeMode ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}
        title={routeMode ? "关闭路线模式" : "路线模式"}><Route size={11} /></button>
      <button onClick={() => onStartRectPick?.()}
        className="px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center text-[var(--app-color-accent)] hover:bg-[var(--app-color-accent-soft)]"
        title="地图框选标记区域（点击两点画矩形）"><SquareDashed size={11} /></button>
      {onToggleCoordEditMode && (
        <button onClick={onToggleCoordEditMode}
          className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center gap-0.5 ${coordEditMode ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}
          title={coordEditMode ? "关闭坐标系编辑" : "坐标系编辑（拖拽参考框移动/旋转）"}><Crosshair size={11} /><span className="text-[8px]">坐标</span></button>
      )}
      {coordEditMode && onSaveCoordPreset && (
        <>
          <button onClick={onSaveCoordPreset}
            className="px-1 py-0.5 rounded-full text-[9px] text-[var(--app-color-text-tertiary)] hover:text-green-500 hover:bg-[var(--app-color-surface-hover)]"
            title="保存当前坐标系配置为预设">{coordPresetSaved ? "✓已存" : "保存"}</button>
          <button onClick={onRestoreCoordPreset}
            className="px-1 py-0.5 rounded-full text-[9px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]"
            title="从预设恢复坐标系配置">恢复</button>
          <button onClick={onResetCoordZero}
            className="px-1 py-0.5 rounded-full text-[9px] text-[var(--app-color-text-tertiary)] hover:text-red-500 hover:bg-[var(--app-color-surface-hover)]"
            title="归零所有坐标系偏移和旋转">归零</button>
        </>
      )}
      {onToggleZoneEditMode && (
        <button onClick={onToggleZoneEditMode}
          className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center gap-0.5 ${zoneEditMode ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}
          title={zoneEditMode ? "关闭标签编辑" : "标签编辑（拖拽调整区域大小/位置）"}><Edit3 size={11} /><span className="text-[8px]">标签</span></button>
      )}
      {onUndo && undoLabel && (
        <button onClick={onUndo}
          className="px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center gap-0.5 text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
          title={`撤销: ${undoLabel} (Ctrl+Z)`}><Undo2 size={11} /><span className="text-[9px] max-w-[60px] truncate">{undoLabel}</span></button>
      )}
      {routeMode && (
        <button onClick={() => onGenerateTopology?.()}
          disabled={topologyGenerating}
          className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center gap-1 ${
            topologyGenerating ? "opacity-50 cursor-not-allowed text-[var(--app-color-text-tertiary)]" : "text-[var(--app-color-accent)] hover:bg-[var(--app-color-accent-soft)]"
          }`}
          title="从数据库轨迹重新生成路线拓扑">
          <Zap size={10} className={topologyGenerating ? "animate-spin" : ""} />
        </button>
      )}
      <button onClick={onToggleFollowMode}
        className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center ${followMode ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}
        title={followMode ? "关闭视角跟随" : "视角跟随"}><Crosshair size={11} /></button>
      <button onClick={onToggleVehicleIcon}
        className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center ${vehicleIcon==='forklift' ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}
        title={vehicleIcon==='arrow'?'切为叉车图标':'切为箭头图标'}><span style={{fontSize:'11px'}}>{vehicleIcon==='arrow'?'▶':'🚜'}</span></button>
      <button onClick={onAnalysisToggle}
        className={`px-1.5 py-0.5 rounded-full text-[10px] transition-colors flex items-center ${analysisOpen ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]" : "text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]"}`}><Settings2 size={11} /></button>
    </div>
    {/* 标签下拉面板（fixed 定位脱离 bar overflow 限制） */}
    {tagDropdownIp && dropdownPos && hiddenTagsByIp && onToggleHiddenTag && (() => {
      const colors = allTagColors ?? BUILTIN_TAG_COLORS;
      const tags = creatableTags ?? [...BUILTIN_TAG_OPTIONS];
      const ip = tagDropdownIp;
      const hidden = hiddenTagsByIp[ip] ?? new Set<string>();
      return (
        <>
          <div className="fixed inset-0 z-[var(--z-dropdown)]" onClick={() => { setTagDropdownIp(null); setDropdownPos(null); }} />
          <div className="fixed z-[var(--z-tooltip)] flex flex-wrap gap-0.5 px-2 py-1.5 rounded-lg bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-lg min-w-[130px]"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
            onClick={(e) => e.stopPropagation()}>
            {tags.map(tag => {
              const isHidden = hidden.has(tag);
              const tagColor = colors[tag] || "#6b7280";
              return (
                <button key={tag} onClick={() => onToggleHiddenTag(ip, tag)}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap transition-colors ${isHidden ? "opacity-30 bg-[var(--app-color-border-default)]" : "text-white"}`}
                  style={!isHidden ? { backgroundColor: tagColor } : {}}
                >{tag}</button>
              );
            })}
            {/* 自定义标签分隔线 + 标签列表 */}
            {(customTags && customTags.filter(t => t.scope === "world" || t.agvIp === ip).length > 0) && (
              <span className="w-full h-px bg-[var(--app-color-border-default)] my-0.5" />
            )}
            {customTags?.filter(t => t.scope === "world" || t.agvIp === ip).map(ct => (
              <span key={ct.id} className="flex items-center gap-1 px-1">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ct.color }} />
                <span className="text-[8px] text-[var(--app-color-text-tertiary)]">{ct.name}</span>
                {onDeleteCustomTag && (
                  <button onClick={() => onDeleteCustomTag(ct.id)}
                    className="text-[var(--app-color-text-tertiary)] hover:text-red-500"><Trash2 size={8} /></button>
                )}
              </span>
            ))}
            {/* 添加自定义标签 */}
            <span className="w-full h-px bg-[var(--app-color-border-default)] my-0.5" />
            {!showAddTag ? (
              <button onClick={() => setShowAddTag(true)}
                className="flex items-center gap-1 px-1 py-0.5 text-[9px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] w-full">
                <Plus size={10} /> 新建标签
              </button>
            ) : (
              <div className="w-full space-y-1">
                <input value={newTagName} onChange={e => setNewTagName(e.target.value)}
                  placeholder="标签名" className="w-full px-1.5 py-0.5 rounded text-[10px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]" />
                <div className="flex items-center gap-1">
                  <input type="color" value={newTagColor} onChange={e => setNewTagColor(e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer border-0 p-0" />
                  <select value={newTagScope} onChange={e => setNewTagScope(e.target.value as any)}
                    className="flex-1 px-1 py-0.5 rounded text-[9px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]">
                    <option value="world">全局标签</option>
                    <option value="agv">仅 {ip.endsWith(".16") ? "AGV-1" : ip.endsWith(".18") ? "AGV-2" : ip.endsWith(".20") ? "AGV-3" : "AGV-4"}</option>
                  </select>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => {
                    if (newTagName.trim() && onAddCustomTag) {
                      const scopeIp = newTagScope === "agv" ? ip : undefined;
                      onAddCustomTag(newTagName.trim(), newTagColor, newTagScope, scopeIp);
                      setNewTagName(""); setShowAddTag(false);
                    }
                  }} disabled={!newTagName.trim()}
                    className="flex-1 px-2 py-0.5 rounded text-[9px] bg-[var(--app-color-accent)] text-white disabled:opacity-40">创建</button>
                  <button onClick={() => { setShowAddTag(false); setNewTagName(""); }}
                    className="px-2 py-0.5 rounded text-[9px] border border-[var(--app-color-border-default)] text-[var(--app-color-text-tertiary)]">取消</button>
                </div>
              </div>
            )}
          </div>
        </>
      );
    })()}
    </>
  );
}
