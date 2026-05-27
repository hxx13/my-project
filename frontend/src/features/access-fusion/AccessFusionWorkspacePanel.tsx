import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Settings2, Trash2 } from "lucide-react";
import { listAccessChannelScope, listGlobalEnabledCleanChannels } from "@/api/domains/accessFusion.api";
import { listDahuaSwingStatsTasks, type DahuaSwingStatsPullTask } from "@/api/domains/dahuaSwingStats.api";
import { AccessChannelScopeDrawer } from "@/features/access-fusion/AccessChannelScopeDrawer";
import { AccessCleanRuleProfilesModal } from "@/features/access-fusion/AccessCleanRuleProfilesModal";
import { AccessFusionLibraryPanel } from "@/features/access-fusion/AccessFusionLibraryPanel";
import {
  AccessFusionExecutionLogDrawer,
  AccessFusionExecutionLogTrigger,
} from "@/features/access-fusion/AccessFusionExecutionLogDrawer";
import { AccessFusionPurgeLibraryModal } from "@/features/access-fusion/AccessFusionPurgeLibraryModal";
import {
  AccessRecordFilterBar,
  accessFilterToolbarBtnClass,
  emptyAccessFilters,
  type AccessRecordFilters,
  type AccessTaskOption,
} from "@/features/access-audit/AccessRecordFilterBar";
import { resolveCleanDataWindow } from "@/features/dahua-swing-stats/statsTaskModel";
import { cn } from "@/lib/utils";

type Props = {
  /** 为 true 时自动打开清洗规则方案弹窗（旧独立路由重定向用） */
  initialProfilesOpen?: boolean;
};

/** 门禁统计清洗工作区：可嵌入「门禁数据工作台」Tab */
export function AccessFusionWorkspacePanel({ initialProfilesOpen }: Props) {
  const [tasks, setTasks] = useState<AccessTaskOption[]>([]);
  const [statsTasksFull, setStatsTasksFull] = useState<DahuaSwingStatsPullTask[]>([]);
  const [enabledChannelCount, setEnabledChannelCount] = useState(0);
  const [filters, setFilters] = useState<AccessRecordFilters>(emptyAccessFilters);
  const [channelCodes, setChannelCodes] = useState<string[]>([]);
  const [scopeDrawer, setScopeDrawer] = useState(false);
  const [logDrawer, setLogDrawer] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(!!initialProfilesOpen);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [libraryReloadKey, setLibraryReloadKey] = useState(0);

  const statsTaskId = filters.taskId ? Number(filters.taskId) : 0;
  const taskName = tasks.find((t) => t.id === statsTaskId)?.name;

  const loadTasks = useCallback(async () => {
    try {
      const list = await listDahuaSwingStatsTasks();
      setStatsTasksFull(list);
      setTasks(
        list.map((t) => ({
          id: t.id,
          name: t.name,
          periodMode: t.periodMode,
          lastPulledStart: t.lastPulledStart,
          lastPulledEnd: t.lastPulledEnd,
        }))
      );
    } catch {
      setStatsTasksFull([]);
      setTasks([]);
    }
  }, []);

  const loadEnabledChannels = useCallback(async () => {
    try {
      const ch = await listGlobalEnabledCleanChannels();
      setEnabledChannelCount(ch.length);
    } catch {
      setEnabledChannelCount(0);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
    void loadEnabledChannels();
  }, [loadTasks, loadEnabledChannels]);

  useEffect(() => {
    if (!statsTaskId) return;
    const t = statsTasksFull.find((x) => x.id === statsTaskId);
    if (!t) return;
    const win = resolveCleanDataWindow(t);
    if (!win.startTime && !win.endTime) return;
    setFilters((prev) => ({
      ...prev,
      startTime: win.startTime || prev.startTime,
      endTime: win.endTime || prev.endTime,
    }));
  }, [statsTaskId, statsTasksFull]);

  useEffect(() => {
    if (!statsTaskId) return;
    void (async () => {
      try {
        const scope = await listAccessChannelScope(statsTaskId);
        const allowed = new Set(
          scope.filter((c) => c.enabled !== 0 && c.channelCode).map((c) => c.channelCode)
        );
        if (allowed.size > 0) {
          setChannelCodes((prev) => {
            const next = prev.filter((c) => allowed.has(c));
            return next.length > 0 ? next : [...allowed];
          });
        } else {
          setChannelCodes([]);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [statsTaskId]);

  const channelHint = useMemo(() => {
    if (!statsTaskId) {
      return "请选择统计任务：列表将按该任务在门禁记录库中的刷卡来源筛选（总库按通道合并，多任务同通道时需选任务）。";
    }
    if (channelCodes.length === 0) {
      return "当前任务未配置已启用通道，请打开「通道漏斗」启用通道；入库在「审计拉取」Tab 控制。";
    }
    return null;
  }, [statsTaskId, channelCodes.length]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        查询与纠错已入库的<strong>清洗总库</strong>。入库在「审计拉取」控制（拉取后自动清洗、手动清洗）；隔离服统计所选通道与此处通道漏斗为同一套已启用通道。
        {enabledChannelCount > 0 ? (
          <span className="ml-1 text-slate-500">（全局已启用 {enabledChannelCount} 个通道）</span>
        ) : null}
      </p>

      {channelHint ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{channelHint}</p>
      ) : null}

      <AccessRecordFilterBar
        tasks={tasks}
        filters={filters}
        onChange={setFilters}
        onSearch={() => {}}
        searchLabel="应用时间窗"
        hideActionType
        cleanChannelCodes={channelCodes}
        onCleanChannelCodesChange={setChannelCodes}
        showLibraryFilters
        configSlot={
          <>
            {statsTaskId ? (
              <button type="button" className={cn(accessFilterToolbarBtnClass)} onClick={() => setScopeDrawer(true)}>
                <Filter className="h-3.5 w-3.5" />
                通道漏斗
              </button>
            ) : null}
            <button
              type="button"
              className={cn(accessFilterToolbarBtnClass)}
              onClick={() => setProfilesOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              清洗规则方案
            </button>
            <AccessFusionExecutionLogTrigger onClick={() => setLogDrawer(true)} />
            <button
              type="button"
              className={cn(accessFilterToolbarBtnClass, "border-rose-200 text-rose-800 hover:bg-rose-50")}
              onClick={() => setPurgeOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空清洗库
            </button>
          </>
        }
      />

      <AccessFusionLibraryPanel
        key={libraryReloadKey}
        statsPullTaskId={statsTaskId || undefined}
        channelCodes={channelCodes}
        startTime={filters.startTime}
        endTime={filters.endTime}
        libraryActionType={filters.libraryActionType}
        libraryDisposition={filters.libraryDisposition}
        libraryAudience={filters.libraryAudience}
        libraryPersonName={filters.libraryPersonName}
        selectedLogId={selectedLogId}
        onClearLogFilter={() => setSelectedLogId(null)}
      />

      <AccessChannelScopeDrawer
        open={scopeDrawer}
        onOpenChange={setScopeDrawer}
        statsTaskId={statsTaskId}
        taskName={taskName}
        onSaved={() => void loadEnabledChannels()}
      />

      <AccessFusionExecutionLogDrawer
        open={logDrawer}
        onOpenChange={setLogDrawer}
        statsTaskId={statsTaskId}
        channelCodes={channelCodes}
        startTime={filters.startTime}
        endTime={filters.endTime}
        selectedLogId={selectedLogId}
        onSelectLogId={setSelectedLogId}
        onLogDeleted={() => setSelectedLogId(null)}
      />

      <AccessFusionPurgeLibraryModal
        open={purgeOpen}
        onClose={() => setPurgeOpen(false)}
        channelCodes={channelCodes}
        onPurged={() => {
          setSelectedLogId(null);
          setLibraryReloadKey((k) => k + 1);
        }}
      />

      <AccessCleanRuleProfilesModal open={profilesOpen} onOpenChange={setProfilesOpen} />
    </div>
  );
}
