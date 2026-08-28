import { useQuery } from "@tanstack/react-query";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import { fetchDashboardViolationBoard } from "@/api/domains/dashboardViolationBoard.api";
import { dashTone, useDashboardVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { DASH_NIGHT_CLASS } from "@/features/dashboard-scifi-theme/dashboardNightTokens";
import { CodexNoticeStreamPanel } from "./CodexNoticeStreamPanel";
import { CodexViolationBoardPanel } from "./CodexViolationBoardPanel";
import { useCodexTabRotation, type CodexTabId } from "./useCodexTabRotation";

const K = {
  title: "dashboard.codex.title",
  hoursLabel: "dashboard.codex.hours_label",
  startTime: "dashboard.codex.start_time",
  endTime: "dashboard.codex.end_time",
  returnRules: "dashboard.codex.return_rules",
  noticeTitle: "dashboard.codex.notice_title",
  noticeBody: "dashboard.codex.notice_body",
  titleFontScale: "dashboard.codex.title_font_scale",
  noticeTabSeconds: "dashboard.codex.notice_tab_seconds",
  violationBoardEnabled: "dashboard.codex.violation_board_enabled",
} as const;

const SCALE_KEYS = new Set(["sm", "md", "lg", "xl"]);

const FALLBACK = {
  title: "标准还卡与违规惩戒说明",
  hoursLabel: "标准还卡时段",
  startTime: "08:00",
  endTime: "17:30",
  returnRules:
    "每天早 8:00—晚 5:30 为卡片使用时间。超时未还卡可能导致无法退出登录或权限受限，需联系老师解封；如需延长使用请提前与老师沟通。",
  noticeTitle: "公告与通知",
  noticeBody: "",
  titleFontScale: "lg",
  noticeTabSeconds: "12",
  violationBoardEnabled: "true",
};

const TITLE_CLASS: Record<"sm" | "md" | "lg" | "xl", string> = {
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-3xl md:text-4xl",
  xl: "text-3xl md:text-4xl lg:text-5xl",
};

function pick(cfg: Record<string, string> | undefined, key: string, fallback: string) {
  if (!cfg) return fallback;
  const v = cfg[key];
  if (v == null) return fallback;
  const s = String(v).trim();
  return s !== "" ? s : fallback;
}

function normalizeScale(raw: string, fallback: string): "sm" | "md" | "lg" | "xl" {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (SCALE_KEYS.has(s)) return s as "sm" | "md" | "lg" | "xl";
  const fb = String(fallback || "md")
    .trim()
    .toLowerCase();
  if (SCALE_KEYS.has(fb)) return fb as "sm" | "md" | "lg" | "xl";
  return "md";
}

function parseBool(v: string, fallback: boolean): boolean {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

function parseIntSafe(v: string, fallback: number): number {
  const n = Number.parseInt(v.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function CodexTabButtons({
  tabs,
  current,
  onSelect,
  violationCount,
}: {
  tabs: CodexTabId[];
  current: CodexTabId;
  onSelect: (t: CodexTabId) => void;
  violationCount?: number;
}) {
  const visual = useDashboardVisual();
  const labels: Record<CodexTabId, string> = {
    notice: "公告",
    violation: violationCount != null && violationCount > 0 ? `提醒公示 (${violationCount})` : "提醒公示",
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2" role="tablist" aria-label="公告与提醒切换">
      {tabs.map((t) => {
        const active = t === current;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(t)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold tracking-wide transition-all sm:px-3.5 sm:py-2 sm:text-sm ${
              active
                ? dashTone(
                    visual,
                    "border-cyan-400/60 bg-cyan-500/20 text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,0.35)]",
                    `${DASH_NIGHT_CLASS.tabBtnActive}`,
                    "border-amber-500/70 bg-amber-100 text-amber-950 shadow-sm",
                  )
                : dashTone(
                    visual,
                    "border-slate-600/50 bg-slate-900/40 text-slate-400 hover:border-slate-500 hover:text-slate-200",
                    `${DASH_NIGHT_CLASS.tabBtn}`,
                    "border-slate-200 bg-white/80 text-slate-500 hover:border-slate-300 hover:text-slate-800",
                  )
            }`}
          >
            {labels[t]}
          </button>
        );
      })}
    </div>
  );
}

export function RuleCodexCard() {
  const visual = useDashboardVisual();

  const { data: cfg, isLoading, isError } = useQuery({
    queryKey: ["public-runtime-config"],
    queryFn: fetchPublicRuntimeConfig,
    staleTime: 60_000,
  });

  const boardQ = useQuery({
    queryKey: ["dashboard-violation-board"],
    queryFn: fetchDashboardViolationBoard,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const title = pick(cfg, K.title, FALLBACK.title);
  const hoursLabel = pick(cfg, K.hoursLabel, FALLBACK.hoursLabel);
  const startTime = pick(cfg, K.startTime, FALLBACK.startTime);
  const endTime = pick(cfg, K.endTime, FALLBACK.endTime);
  const returnRules = pick(cfg, K.returnRules, FALLBACK.returnRules);
  const noticeTitle = pick(cfg, K.noticeTitle, FALLBACK.noticeTitle);
  const noticeBody = pick(cfg, K.noticeBody, FALLBACK.noticeBody);
  const titleScale = normalizeScale(
    pick(cfg, K.titleFontScale, FALLBACK.titleFontScale),
    FALLBACK.titleFontScale
  );
  const noticeTabSeconds = parseIntSafe(
    pick(cfg, K.noticeTabSeconds, FALLBACK.noticeTabSeconds),
    12
  );

  const cfgViolationOn = parseBool(
    pick(cfg, K.violationBoardEnabled, FALLBACK.violationBoardEnabled),
    true
  );
  const apiViolationOn = boardQ.data?.enabled !== false;
  const violationEnabled = cfgViolationOn && apiViolationOn;
  const hasViolations = (boardQ.data?.items?.length ?? 0) > 0;
  const showViolationTab = violationEnabled;

  const { tab, generation, setTab, onPanelCycleComplete, ensureNotice } = useCodexTabRotation({
    violationEnabled: showViolationTab,
    hasViolations,
    autoRotateSeconds: noticeTabSeconds,
  });

  const tabs: CodexTabId[] = showViolationTab ? ["notice", "violation"] : ["notice"];
  const effectiveTab = showViolationTab ? tab : "notice";

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
      <div
        className={`flex shrink-0 flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center sm:justify-between ${
          dashTone(visual, "border-cyan-500/25", DASH_NIGHT_CLASS.header, "border-slate-200/70")
        }`}
      >
        <h3
          className={`min-w-0 font-black tracking-tight ${
            dashTone(visual, "text-slate-100 drop-shadow-[0_0_10px_rgba(34,211,238,0.25)]", DASH_NIGHT_CLASS.title, "text-slate-900")
          } ${TITLE_CLASS[titleScale]}`}
        >
          {title}
        </h3>
        {showViolationTab ? (
          <CodexTabButtons
            tabs={tabs}
            current={effectiveTab}
            onSelect={setTab}
            violationCount={boardQ.data?.items?.length}
          />
        ) : null}
      </div>

      {isError ? (
        <div className="mt-1 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          暂时无法从服务器同步公告配置，下方为默认文案；请检查网络或稍后刷新。
        </div>
      ) : null}
      {isLoading ? (
        <div
          className={`mt-1 shrink-0 text-center text-[11px] ${dashTone(visual, "text-slate-400", "text-white/45", "text-slate-400")}`}
        >
          正在同步配置…
        </div>
      ) : null}

      <div className="mt-2 min-h-0 flex-1 overflow-hidden">
        {effectiveTab === "notice" ? (
          <CodexNoticeStreamPanel
            noticeTitle={noticeTitle}
            noticeBody={noticeBody}
            hoursLabel={hoursLabel}
            startTime={startTime}
            endTime={endTime}
            returnRules={returnRules}
            active={effectiveTab === "notice"}
            generation={generation}
            onCycleComplete={onPanelCycleComplete}
            fallbackSeconds={noticeTabSeconds}
            scrollMode={showViolationTab && hasViolations ? "cycle" : "loop"}
          />
        ) : (
          <CodexViolationBoardPanel
            active={effectiveTab === "violation"}
            generation={generation}
            onCycleComplete={onPanelCycleComplete}
            onEmpty={ensureNotice}
          />
        )}
      </div>
    </div>
  );
}
