import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Edit3, ToggleLeft, ToggleRight, Save } from "lucide-react";
import {
  useConfigs, useCreateConfig, useUpdateConfig, useDeleteConfig,
  useToggleConfig, useStations,
  type StatsConfig,
} from "@/api/domains/agv-stats.api";

type TabKey = "STATION_GROUP" | "METRIC_PIPE" | "BUNDLE";

const TABS: { key: TabKey; label: string }[] = [
  { key: "STATION_GROUP", label: "站点组" },
  { key: "METRIC_PIPE", label: "指标管道" },
  { key: "BUNDLE", label: "组合包" },
];

const METRIC_OPTIONS = [
  { key: "total_transport_tasks", label: "运输任务总数" },
  { key: "active_transport_tasks", label: "进行中运输任务" },
  { key: "completed_tasks", label: "已完成任务" },
  { key: "avg_task_duration_sec", label: "平均任务耗时" },
  { key: "total_distance_m", label: "累计里程" },
  { key: "charging_sessions", label: "充电次数" },
  { key: "avg_charging_duration_sec", label: "平均充电耗时" },
  { key: "idle_time_sec", label: "空闲时间" },
  { key: "station_work_count", label: "作业站工作次数" },
  { key: "error_count", label: "异常次数" },
  { key: "uptime_pct", label: "运行率" },
  { key: "battery_cycles", label: "电池循环" },
];

interface Props { open: boolean; onClose: () => void; }

function defaultDef(type: TabKey): string {
  switch (type) {
    case "STATION_GROUP": return JSON.stringify({ stations: [], metrics: [], agvIps: [] });
    case "METRIC_PIPE":  return JSON.stringify({ sourceGroups: [], metrics: [] });
    case "BUNDLE":       return JSON.stringify({ pipeIds: [] });
    default:             return "{}";
  }
}

export default function AgvStatsConfigPanel({ open, onClose }: Props) {
  const { data: configs = [] } = useConfigs();
  const { data: stations = [] } = useStations();
  const createMut = useCreateConfig();
  const updateMut = useUpdateConfig();
  const deleteMut = useDeleteConfig();
  const toggleMut = useToggleConfig();

  const [tab, setTab] = useState<TabKey>("METRIC_PIPE");
  const [editing, setEditing] = useState<StatsConfig | null>(null);

  // Form state
  const [fName, setFName] = useState("");
  const [fSlug, setFSlug] = useState("");
  const [fStations, setFStations] = useState<string[]>([]);
  const [fMetrics, setFMetrics] = useState<string[]>([]);
  const [fAgvIps, setFAgvIps] = useState<string[]>([]);
  const [fSourceSlugs, setFSourceSlugs] = useState<string[]>([]);
  const [fBundleSlugs, setFBundleSlugs] = useState<string[]>([]);

  // Filter by current tab
  const list = configs.filter(c => c.configType === tab);
  const stationGroups = configs.filter(c => c.configType === "STATION_GROUP");
  const pipes = configs.filter(c => c.configType === "METRIC_PIPE");

  // Reset form when editing changes or tab changes
  const resetForm = () => {
    setFName(""); setFSlug("");
    setFStations([]); setFMetrics([]); setFAgvIps([]);
    setFSourceSlugs([]); setFBundleSlugs([]);
  };

  useEffect(() => {
    if (!editing) { resetForm(); return; }
    setFName(editing.name);
    setFSlug(editing.pipelineSlug || "");
    try {
      const d = JSON.parse(editing.definitionJson || "{}");
      setFStations(d.stations || []);
      setFMetrics(d.metrics || []);
      setFAgvIps(d.agvIps || []);
      setFSourceSlugs(d.sourceGroups || []);
      setFBundleSlugs(d.pipeIds || []);
    } catch { resetForm(); }
  }, [editing]);

  // Reset form on tab switch (unless actively editing)
  useEffect(() => { if (!editing) resetForm(); }, [tab]);

  const startNew = () => {
    setEditing({ name: "", configType: tab, definitionJson: defaultDef(tab), pipelineSlug: "" });
  };

  const startEdit = (cfg: StatsConfig) => { setEditing(cfg); };

  const cancelEdit = () => { setEditing(null); };

  const handleSave = () => {
    let defJson = "{}";
    switch (tab) {
      case "STATION_GROUP":
        defJson = JSON.stringify({ stations: fStations, metrics: fMetrics, agvIps: fAgvIps });
        break;
      case "METRIC_PIPE":
        defJson = JSON.stringify({ sourceGroups: fSourceSlugs, metrics: fMetrics });
        break;
      case "BUNDLE":
        defJson = JSON.stringify({ pipeIds: fBundleSlugs });
        break;
    }
    const payload: Omit<StatsConfig, "id" | "createdAt" | "updatedAt"> = {
      name: fName.trim(),
      configType: tab,
      definitionJson: defJson,
      pipelineSlug: fSlug.trim() || undefined,
    };
    if (editing?.id) {
      updateMut.mutate({ id: editing.id, data: payload }, { onSuccess: () => setEditing(null) });
    } else {
      createMut.mutate(payload as any, { onSuccess: () => setEditing(null) });
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm("确定删除此配置？")) deleteMut.mutate(id);
  };

  const toggle = (s: string, arr: string[], set: (v: string[]) => void) => {
    set(arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s]);
  };

  const mutError = (createMut.error || updateMut.error)?.message;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }} onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }}
          >
            <div
              className="relative w-full max-w-xl max-h-[85vh] flex flex-col bg-[var(--app-color-surface-container)] rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-[var(--app-color-border-default)]">
                <h2 className="text-sm font-semibold text-[var(--app-color-text-primary)]">统计管道配置</h2>
                <button onClick={onClose}
                  className="p-1 rounded-full text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)] transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex border-b border-[var(--app-color-border-default)] px-3">
                {TABS.map(t => (
                  <button key={t.key} onClick={() => { setTab(t.key); setEditing(null); }}
                    className={`px-4 py-2 text-[11px] font-medium border-b-2 transition-colors ${
                      tab === t.key
                        ? "border-[var(--app-color-accent)] text-[var(--app-color-accent)]"
                        : "border-transparent text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)]"
                    }`}>
                    {t.label}
                    <span className="ml-1.5 text-[9px] opacity-50">
                      {configs.filter(c => c.configType === t.key).length}
                    </span>
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {/* List */}
                {!editing && (
                  <div className="p-3">
                    <button onClick={startNew}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[var(--app-radius-element)] border border-dashed border-[var(--app-color-border-default)] text-[11px] text-[var(--app-color-text-tertiary)] hover:border-[var(--app-color-accent)] hover:text-[var(--app-color-accent)] transition-colors mb-3">
                      <Plus size={12} /> 新建{TABS.find(t => t.key === tab)?.label}
                    </button>

                    {list.length === 0 ? (
                      <div className="py-8 text-center text-[11px] text-[var(--app-color-text-tertiary)]">
                        暂无{TABS.find(t => t.key === tab)?.label}配置
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {list.map(cfg => (
                          <div key={cfg.id}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)] transition-colors group">
                            {/* Toggle */}
                            {tab !== "STATION_GROUP" && (
                              <button onClick={() => cfg.id != null && toggleMut.mutate({ id: cfg.id, active: cfg.isActive ? 0 : 1 })}
                                className="shrink-0">
                                {cfg.isActive !== false
                                  ? <ToggleRight size={16} className="text-[var(--app-color-accent)]" />
                                  : <ToggleLeft size={16} className="text-[var(--app-color-text-tertiary)]" />}
                              </button>
                            )}
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-medium text-[var(--app-color-text-primary)] truncate">{cfg.name}</div>
                              <div className="text-[9px] text-[var(--app-color-text-tertiary)]">
                                {cfg.pipelineSlug ? <span className="font-mono">/{cfg.pipelineSlug}</span> : <span className="italic opacity-50">无标识</span>}
                                {tab === "STATION_GROUP" && (() => {
                                  try {
                                    const d = JSON.parse(cfg.definitionJson || "{}");
                                    const sts = d.stations || [];
                                    return <span className="ml-2">站点 {sts.length} 个</span>;
                                  } catch { return null; }
                                })()}
                                {tab === "METRIC_PIPE" && (() => {
                                  try {
                                    const d = JSON.parse(cfg.definitionJson || "{}");
                                    const srcs = d.sourceGroups || [];
                                    return <span className="ml-2">源组 {srcs.length} 个</span>;
                                  } catch { return null; }
                                })()}
                              </div>
                            </div>
                            {/* Actions */}
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEdit(cfg)}
                                className="p-1 rounded text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]">
                                <Edit3 size={12} />
                              </button>
                              <button onClick={() => cfg.id != null && handleDelete(cfg.id)}
                                className="p-1 rounded text-[var(--app-color-text-tertiary)] hover:text-red-500 hover:bg-red-50">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Edit form */}
                {editing && (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[12px] font-semibold text-[var(--app-color-text-primary)]">
                        {editing.id ? `编辑: ${editing.name}` : `新建${TABS.find(t => t.key === tab)?.label}`}
                      </h3>
                      <button onClick={cancelEdit}
                        className="text-[10px] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]">
                        返回列表
                      </button>
                    </div>

                    {/* Name */}
                    <label className="block">
                      <span className="text-[9px] text-[var(--app-color-text-tertiary)]">名称 *</span>
                      <input value={fName} onChange={e => setFName(e.target.value)}
                        placeholder={`例如: ${tab === "STATION_GROUP" ? "充电站组" : tab === "METRIC_PIPE" ? "AGV-1 统计" : "南区全景"}`}
                        className="w-full mt-0.5 px-2.5 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px] placeholder:text-[var(--app-color-text-tertiary)]" />
                    </label>

                    {/* Slug (METRIC_PIPE only) */}
                    {tab === "METRIC_PIPE" && (
                      <label className="block">
                        <span className="text-[9px] text-[var(--app-color-text-tertiary)]">管道标识 (slug)</span>
                        <input value={fSlug} onChange={e => setFSlug(e.target.value)}
                          placeholder="例如: charge-zone-stats"
                          disabled={!!editing?.id}
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] text-[11px] placeholder:text-[var(--app-color-text-tertiary)] disabled:opacity-40" />
                      </label>
                    )}

                    {/* STATION_GROUP: station picker */}
                    {tab === "STATION_GROUP" && (
                      <div>
                        <span className="text-[9px] text-[var(--app-color-text-tertiary)]">
                          站点 {fStations.length > 0 && `(${fStations.length} 已选)`}
                        </span>
                        <div className="mt-0.5 max-h-[130px] overflow-y-auto border border-[var(--app-color-border-default)] rounded-[var(--app-radius-element)] p-2">
                          {stations.length === 0 ? (
                            <span className="text-[10px] text-[var(--app-color-text-tertiary)] italic">暂无可用站点（需轨迹数据产生后才有）</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {stations.map(s => (
                                <button key={s} onClick={() => toggle(s, fStations, setFStations)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                                    fStations.includes(s)
                                      ? "bg-[var(--app-color-accent)] text-white border-[var(--app-color-accent)]"
                                      : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                                  }`}>{s}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* STATION_GROUP: AGV IP picker */}
                    {tab === "STATION_GROUP" && (
                      <div>
                        <span className="text-[9px] text-[var(--app-color-text-tertiary)]">AGV 小车 {fAgvIps.length > 0 && `(${fAgvIps.length})`}</span>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {["172.22.159.16","172.22.159.18","172.22.159.20","172.22.159.22"].map(ip => (
                            <button key={ip} onClick={() => toggle(ip, fAgvIps, setFAgvIps)}
                              className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                                fAgvIps.includes(ip)
                                  ? "bg-[var(--app-color-accent)] text-white border-[var(--app-color-accent)]"
                                  : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                              }`}>{ip.replace("172.22.159.","AGV-")}</button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* METRIC_PIPE: source group picker */}
                    {tab === "METRIC_PIPE" && (
                      <div>
                        <span className="text-[9px] text-[var(--app-color-text-tertiary)]">
                          源站点组 {fSourceSlugs.length > 0 && `(${fSourceSlugs.length} 已选)`}
                        </span>
                        <div className="mt-0.5 max-h-[100px] overflow-y-auto space-y-0.5">
                          {stationGroups.length === 0 ? (
                            <span className="text-[10px] text-[var(--app-color-text-tertiary)] italic">暂无站点组，请先在"站点组"Tab 中创建</span>
                          ) : (
                            stationGroups.map(sg => (
                              <button key={sg.id}
                                onClick={() => sg.pipelineSlug && toggle(sg.pipelineSlug, fSourceSlugs, setFSourceSlugs)}
                                className={`w-full text-left px-2.5 py-1.5 rounded text-[10px] transition-colors ${
                                  sg.pipelineSlug && fSourceSlugs.includes(sg.pipelineSlug)
                                    ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] font-medium"
                                    : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                                }`}>
                                {sg.name}
                                {sg.pipelineSlug && <span className="ml-1.5 text-[9px] opacity-50 font-mono">/{sg.pipelineSlug}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* BUNDLE: pipe picker */}
                    {tab === "BUNDLE" && (
                      <div>
                        <span className="text-[9px] text-[var(--app-color-text-tertiary)]">
                          选择管道 {fBundleSlugs.length > 0 && `(${fBundleSlugs.length} 已选)`}
                        </span>
                        <div className="mt-0.5 max-h-[100px] overflow-y-auto space-y-0.5">
                          {pipes.length === 0 ? (
                            <span className="text-[10px] text-[var(--app-color-text-tertiary)] italic">暂无可用管道</span>
                          ) : (
                            pipes.map(p => (
                              <button key={p.id}
                                onClick={() => p.pipelineSlug && toggle(p.pipelineSlug, fBundleSlugs, setFBundleSlugs)}
                                className={`w-full text-left px-2.5 py-1.5 rounded text-[10px] transition-colors ${
                                  p.pipelineSlug && fBundleSlugs.includes(p.pipelineSlug)
                                    ? "bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] font-medium"
                                    : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                                }`}>
                                {p.name}
                                {p.pipelineSlug && <span className="ml-1.5 text-[9px] opacity-50 font-mono">/{p.pipelineSlug}</span>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {/* Metric checkboxes (all types) */}
                    <div>
                      <span className="text-[9px] text-[var(--app-color-text-tertiary)]">指标 {fMetrics.length > 0 && `(${fMetrics.length} 已选)`}</span>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {METRIC_OPTIONS.map(m => (
                          <button key={m.key} onClick={() => toggle(m.key, fMetrics, setFMetrics)}
                            className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                              fMetrics.includes(m.key)
                                ? "bg-[var(--app-color-accent)] text-white border-[var(--app-color-accent)]"
                                : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                            }`}>{m.label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Error */}
                    {mutError && <div className="text-[10px] text-red-500">保存失败: {mutError}</div>}

                    {/* Buttons */}
                    <div className="flex gap-2 pt-1">
                      <button onClick={handleSave}
                        disabled={createMut.isPending || updateMut.isPending || !fName.trim()}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                        <Save size={11} />{createMut.isPending || updateMut.isPending ? "保存中..." : "保存"}
                      </button>
                      <button onClick={cancelEdit}
                        className="px-4 py-2 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] text-[10px] text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]">
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
