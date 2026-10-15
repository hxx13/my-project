import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getAlarmEvents,
  getFloorPlan,
  getLiveStates,
  getOpenAlarms,
  listAlarmRules,
  listAlarmStats,
  listChannels,
  listNotifyLog,
  resetLayoutPoints,
  saveLayoutPoints,
  syncNow,
  updateAlarmRule,
  type AvidityAlarmFolderTree,
  type AvidityAlarmEventNode,
  type AvidityAlarmRule,
} from "@/api/domains/avidity.api";
import AvidityFloorPlan, {
  pointKey,
  type OverrideMap,
  type PointState,
} from "@/features/avidity/AvidityFloorPlan";
import "@/features/avidity/avidity-floorplan.css";

/**
 * 实验动物饮水流量监测 · 平面图页（ADMIN+）。
 *
 * <p>数据是后端定时从安维迪「云组态」拉回落库的，本页只读我们的库 —— 对方站点抖动
 * 不会把页面拖白。接线见 modules/avidity。
 *
 * <p>版式照原厂「运营仪表盘」的房间布局重建：房间轮廓、管道、点位坐标都是从原图量下来的
 * （见后端 resources/avidity/&lt;画面ID&gt;.json），但去掉了原图的标题条、日期和
 * 正常/报警图例。房间号与笼架名的位置也**重新规整过** —— 原图是手摆的，
 * 横向偏移在 -98 到 +165 之间乱跳。
 *
 * <p>平面图占满整宽：报警列表、点位排行、推送口径这三块是次要信息，收进弹窗、
 * 触发按钮集中在顶栏一行。发光只给「报警」这一真实状态，颜色深浅对应真实次数。
 */
type Pane = "alarms" | "events" | "hot" | "rules" | null;

interface HistoryState {
  varName: string;
  room: string;
  rack: string;
  no: number;
}

const DIALOG_CLS =
  "avidity-page flex w-[92vw] flex-col gap-0 overflow-hidden p-0";

export default function AdminAvidityPage() {
  const qc = useQueryClient();
  const [pickedChannel, setPickedChannel] = useState<number | null>(null);
  const [pane, setPane] = useState<Pane>(null);
  /** 版式编辑：拖动点位后先进这里，点「保存」才落库 */
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<OverrideMap>({});
  /** 点某个点位 → 看它的报警历史 */
  const [history, setHistory] = useState<HistoryState | null>(null);

  const { data: channels = [] } = useQuery({ queryKey: ["avidity", "channels"], queryFn: listChannels });
  const activeChannel = channels.find((c) => c.channelId === pickedChannel) ?? channels[0];

  const planQuery = useQuery({
    queryKey: ["avidity", "plan", activeChannel?.channelId],
    queryFn: () => getFloorPlan(activeChannel!.channelId),
    enabled: !!activeChannel,
    retry: false,
  });
  const plan = planQuery.data;

  // 此刻正在报警的点位：我们按实时状态自己记的（含每条的起始时间），按房间归好档。
  const { data: openAlarms } = useQuery({
    queryKey: ["avidity", "open-alarms", activeChannel?.channelId],
    queryFn: () => getOpenAlarms(activeChannel!.channelId),
    enabled: !!activeChannel,
    refetchInterval: 10_000,
  });

  // 平面图上的灯＝点位实时状态，跟厂平台画面同一路数据。灯变得快，10 秒刷一次。
  // 不带通道参数：顶栏每个 tab 的角标都要数自己那台设备，一次拿全更省事。
  const { data: live } = useQuery({
    queryKey: ["avidity", "live-states"],
    queryFn: () => getLiveStates(),
    refetchInterval: 10_000,
  });

  const { data: stats = [] } = useQuery({
    queryKey: ["avidity", "stats", activeChannel?.channelId],
    queryFn: () => listAlarmStats(undefined, activeChannel!.channelId),
    enabled: !!activeChannel,
    refetchInterval: 60_000,
  });

  const { data: rules = [] } = useQuery({ queryKey: ["avidity", "rules"], queryFn: listAlarmRules });
  const { data: notifyLog = [] } = useQuery({ queryKey: ["avidity", "notify-log"], queryFn: () => listNotifyLog(20) });

  // 报警历史（我们自己记的起止时间），开弹窗时才拉
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["avidity", "events", activeChannel?.channelId],
    queryFn: () => getAlarmEvents(7, activeChannel!.channelId),
    enabled: !!activeChannel && pane === "events",
  });

  const historyQuery = useQuery({
    queryKey: ["avidity", "point-history", history?.varName],
    queryFn: () => getAlarmEvents(30, undefined, history!.varName),
    enabled: !!history,
  });

  const sync = useMutation({
    mutationFn: syncNow,
    onSuccess: (r) => {
      toast.success(`已同步：通道 ${r.channels}、告警统计 ${r.alarmStats} 行、当前报警 ${r.currentAlarms} 条`);
      qc.invalidateQueries({ queryKey: ["avidity"] });
    },
  });

  const saveLayout = useMutation({
    mutationFn: () => {
      const rows = Object.entries(overrides).map(([key, pos]) => {
        const [room, rack, no] = key.split("/");
        return { room, rack, no: Number(no), x: pos.x, y: pos.y };
      });
      return saveLayoutPoints(activeChannel!.channelId, rows);
    },
    onSuccess: (n) => {
      toast.success(`已保存 ${n} 个点位的新位置`);
      setOverrides({});
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["avidity", "plan"] });
    },
  });

  const resetLayout = useMutation({
    mutationFn: () => resetLayoutPoints(activeChannel!.channelId),
    onSuccess: (n) => {
      toast.success(`已恢复默认版式（清掉 ${n} 处手动摆位）`);
      setOverrides({});
      qc.invalidateQueries({ queryKey: ["avidity", "plan"] });
    },
  });

  const toggleRule = useMutation({
    mutationFn: (p: { code: string; enabled: boolean; thresholdCount?: number | null }) =>
      updateAlarmRule(p.code, { enabled: p.enabled, thresholdCount: p.thresholdCount }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avidity", "rules"] }),
  });

  const statMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stats) m.set(s.alarmName, s.alarmCount);
    return m;
  }, [stats]);

  /** 此刻正在报警的点位数（顶栏按钮上的角标） */
  const openCount = openAlarms?.count ?? 0;

  // 点位有两套名字：图上绑定的变量名（实时状态按它索引）和厂平台报警表里的名字。
  // 多数一样，少数不一样（B1 的 E11C-B106 差一个前缀），差的时候布局里带 alarm。
  const alarmAlias = useMemo(() => {
    const m = new Map<string, string>();
    for (const room of plan?.rooms ?? []) {
      for (const rack of room.racks ?? []) {
        for (const p of rack.points ?? []) {
          if (p.alarm) m.set(p.var, p.alarm);
        }
      }
    }
    return m;
  }, [plan]);

  const liveStates = live?.states ?? {};
  const liveCounts = live?.counts ?? {};
  const countOf = useCallback(
    (varName: string) => statMap.get(alarmAlias.get(varName) ?? varName) ?? 0,
    [statMap, alarmAlias]
  );

  const stateOf = useCallback(
    (varName: string): PointState => {
      // 「报警中」＝厂平台画面上那盏灯的颜色，即绑定变量当前非 0。不是报警表里的当前报警。
      if (liveStates[varName]) return "alarm";
      return (statMap.get(alarmAlias.get(varName) ?? varName) ?? 0) > 0 ? "warn" : "normal";
    },
    [liveStates, statMap, alarmAlias]
  );

  // 顶栏角标＝这台设备**此刻**有几个点在报，跟画面上亮的灯一致。
  // 以前数的是报警表里的当前报警 —— 那张表里会躺着几个月前的未恢复记录，跟灯对不上。
  // 实时数据没拿到就先不标（不知道就是不知道，不拿旧数糊上去）。
  const alarmCountOf = useCallback(
    (virtualDeviceId: number) => liveCounts[String(virtualDeviceId)] ?? 0,
    [liveCounts]
  );

  /** 今日报警次数最高的点位 —— 直接回答「今天哪儿最闹」 */
  const hottest = useMemo(() => [...stats].sort((a, b) => b.alarmCount - a.alarmCount).slice(0, 30), [stats]);
  const todayTotal = useMemo(() => stats.reduce((s, x) => s + x.alarmCount, 0), [stats]);

  return (
    <div className="avidity-page flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-2.5 overflow-hidden p-2.5">
      {/* ---------------------------------------------------------- 顶栏：一行放全部 */}
      <div className="av-card flex flex-wrap items-center gap-1.5 px-2.5 py-2">
        {channels.map((c) => {
          const n = alarmCountOf(c.virtualDeviceId);
          return (
            <button
              key={c.channelId}
              className="av-tab"
              data-active={c.channelId === activeChannel?.channelId}
              onClick={() => setPickedChannel(c.channelId)}
            >
              {c.channelName}
              {n > 0 && <span className="av-tab-badge">{n}</span>}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1.5">
          <button className="av-tool" onClick={() => setPane("alarms")}>
            当前报警
            {openCount > 0 && <span className="av-tab-badge">{openCount}</span>}
          </button>
          <button className="av-tool" onClick={() => setPane("events")}>
            报警历史
          </button>
          <button className="av-tool" onClick={() => setPane("hot")}>
            今日报警最多
          </button>
          <button className="av-tool" onClick={() => setPane("rules")}>
            推送口径
          </button>
          <span className="mx-0.5 h-5 w-px" style={{ background: "var(--av-line)" }} />
          {editing ? (
            <>
              <span className="av-mono text-[11px]" style={{ color: "var(--av-text-soft)" }}>
                拖动点位调整位置 · 改了 {Object.keys(overrides).length} 个
              </span>
              <button className="av-tool" onClick={() => { setOverrides({}); setEditing(false); }}>
                取消
              </button>
              <button className="av-tool" disabled={resetLayout.isPending}
                      onClick={() => resetLayout.mutate()}>
                恢复默认
              </button>
              <button className="av-tool av-tool-primary" disabled={!Object.keys(overrides).length || saveLayout.isPending}
                      onClick={() => saveLayout.mutate()}>
                {saveLayout.isPending ? "保存中…" : "保存版式"}
              </button>
            </>
          ) : (
            <button className="av-tool" onClick={() => setEditing(true)}>
              编辑版式
            </button>
          )}
          <span className="mx-0.5 h-5 w-px" style={{ background: "var(--av-line)" }} />
          <button className="av-tool av-tool-primary" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? "同步中…" : "立即同步"}
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------- 平面图：占满剩余空间 */}
      <div className="av-card relative min-h-0 flex-1 overflow-hidden p-2">
        {plan ? (
          <>
            <AvidityFloorPlan
              plan={plan}
              countOf={countOf}
              stateOf={stateOf}
              editing={editing}
              overrides={overrides}
              onDragPoint={(room, rack, no, x, y) =>
                setOverrides((prev) => ({ ...prev, [pointKey(room, rack, no)]: { x, y } }))
              }
              onPick={(room, rack, no, varName) => setHistory({ room, rack, no, varName })}
            />
            {/* 图例：左上角一竖条小矩形 */}
            <div className="av-legend">
              <span className="av-legend-row"><span className="av-swatch-pipe main" />房间外主管道</span>
              <span className="av-legend-row"><span className="av-swatch-pipe branch" />进房间支管</span>
              <span className="av-legend-row"><span className="av-swatch-cell normal" />正常</span>
              <span className="av-legend-row"><span className="av-swatch-cell warn" />今日报过（深浅=次数）</span>
              <span className="av-legend-row"><span className="av-swatch-cell alarm" />报警中</span>
            </div>
          </>
        ) : (
          /* 区分「真的没有布局」（接口明确报错）与「还在读」——
             之前一律写成「还没有平面图布局」，切主题重渲染的空档里会闪一句假话。 */
          <div className="flex h-full items-center justify-center text-[13px]" style={{ color: "var(--av-text-dim)" }}>
            {planQuery.isError ? "该通道还没有平面图布局" : "正在读取平面图…"}
          </div>
        )}
      </div>

      {/* ============================================================ 当前正在报警 */}
      <Dialog open={pane === "alarms"} onOpenChange={(o) => setPane(o ? "alarms" : null)}>
        <DialogContent className={`${DIALOG_CLS} max-h-[80vh] max-w-[580px]`}>
          <DialogHeader className="shrink-0 border-b py-4 pl-5 pr-12" style={{ borderColor: "var(--av-line)" }}>
            <DialogTitle className="flex items-center gap-2.5 text-[15px]">
              当前正在报警
              <span
                className="av-mono rounded-[6px] px-1.5 py-0.5 text-[12px] leading-none"
                style={{ background: openCount ? "var(--av-alarm-soft)" : "var(--av-surface-hover)", color: openCount ? "var(--av-alarm)" : "var(--av-text-soft)" }}
              >
                {openCount}
              </span>
              <span className="av-mono ml-auto text-[11px] font-normal" style={{ color: "var(--av-text-dim)" }}>
                {activeChannel?.channelName} · 按房间归档
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="av-side-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
            <AlarmFolders tree={openAlarms ?? { count: 0, rooms: [] }} mode="open" />
          </div>

          <div className="shrink-0 border-t px-5 py-2.5 text-[11px]" style={{ borderColor: "var(--av-line)", color: "var(--av-text-soft)" }}>
            判定源是厂平台画面上的灯（变量当前值），跟平面图一致；灯变绿这里就消失
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================ 报警历史（我们自己记的） */}
      <Dialog open={pane === "events"} onOpenChange={(o) => setPane(o ? "events" : null)}>
        <DialogContent className={`${DIALOG_CLS} max-h-[80vh] max-w-[580px]`}>
          <DialogHeader className="shrink-0 border-b py-4 pl-5 pr-12" style={{ borderColor: "var(--av-line)" }}>
            <DialogTitle className="flex items-center gap-2.5 text-[15px]">
              报警历史
              <span className="av-mono rounded-[6px] px-1.5 py-0.5 text-[12px] leading-none"
                    style={{ background: "var(--av-surface-hover)", color: "var(--av-text-dim)" }}>
                {events?.count ?? 0}
              </span>
              <span className="av-mono ml-auto text-[11px] font-normal" style={{ color: "var(--av-text-dim)" }}>
                {activeChannel?.channelName} · 近 7 天
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="av-side-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
            {eventsLoading ? (
              <div className="py-10 text-center text-[12px]" style={{ color: "var(--av-text-soft)" }}>加载中…</div>
            ) : (
              <AlarmFolders tree={events ?? { count: 0, rooms: [] }} mode="history" />
            )}
          </div>

          <div className="shrink-0 border-t px-5 py-2.5 text-[11px]" style={{ borderColor: "var(--av-line)", color: "var(--av-text-soft)" }}>
            起止时间是我们盯着实时状态自己记的：灯翻红记开始，翻绿记结束
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================ 今日报警最多的点位 */}
      <Dialog open={pane === "hot"} onOpenChange={(o) => setPane(o ? "hot" : null)}>
        <DialogContent className={`${DIALOG_CLS} max-h-[80vh] max-w-[620px]`}>
          <DialogHeader className="shrink-0 border-b py-4 pl-5 pr-12" style={{ borderColor: "var(--av-line)" }}>
            <DialogTitle className="flex items-center gap-2.5 text-[15px]">
              今日报警最多的点位
              <span className="av-mono ml-auto text-[11px] font-normal" style={{ color: "var(--av-text-dim)" }}>
                {activeChannel?.channelName} · 共 {stats.length} 个点位今天报过 / {todayTotal} 次
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="av-side-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-2">
            {hottest.length === 0 ? (
              <Empty text="今天还没有报警" />
            ) : (
              <ul className="flex flex-col">
                {hottest.map((s, i) => {
                  const max = hottest[0].alarmCount || 1;
                  return (
                    <li key={s.alarmName} className="av-hot-row flex items-center gap-3 rounded-[8px] px-2 py-2">
                      <span className="av-mono w-6 shrink-0 text-right text-[11px]" style={{ color: "var(--av-text-soft)" }}>
                        {i + 1}
                      </span>
                      <span className="av-mono w-[136px] shrink-0 text-[12.5px]">{positionLabel(s.alarmName)}</span>
                      <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: "var(--av-surface-hover)" }}>
                        <span
                          className="av-bar absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${Math.max(2.5, (s.alarmCount / max) * 100)}%` }}
                        />
                      </span>
                      <span className="av-mono w-10 shrink-0 text-right text-[12.5px]" style={{ color: "var(--av-warn)" }}>
                        {s.alarmCount}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t px-5 py-2.5 text-[11px]" style={{ borderColor: "var(--av-line)", color: "var(--av-text-soft)" }}>
            条长与数字都是**该点位今日的真实报警次数**，只统计本通道
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================ 点位历史 */}
      <Dialog open={!!history} onOpenChange={(o) => { if (!o) setHistory(null); }}>
        <DialogContent className={`${DIALOG_CLS} max-h-[80vh] max-w-[560px]`}>
          <DialogHeader className="shrink-0 border-b py-4 pl-5 pr-12" style={{ borderColor: "var(--av-line)" }}>
            <DialogTitle className="flex items-center gap-2.5 text-[15px]">
              {history ? `${history.rack} 内间 · ${history.no} 号点位` : ""}
              <span className="av-mono ml-auto text-[11px] font-normal" style={{ color: "var(--av-text-dim)" }}>
                {history?.varName}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="av-side-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
            {historyQuery.isLoading ? (
              <div className="py-8 text-center text-[13px]" style={{ color: "var(--av-text-dim)" }}>读取中…</div>
            ) : (
              <AlarmFolders tree={historyQuery.data ?? { count: 0, rooms: [] }} mode="history" />
            )}
          </div>

          <div className="shrink-0 border-t px-5 py-2.5 text-[11px]" style={{ borderColor: "var(--av-line)", color: "var(--av-text-soft)" }}>
            近 30 天 · 起止时间是我们盯着实时状态自己记的
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================ 推送口径 */}
      <Dialog open={pane === "rules"} onOpenChange={(o) => setPane(o ? "rules" : null)}>
        <DialogContent className={`${DIALOG_CLS} max-w-[560px]`}>
          <DialogHeader className="shrink-0 border-b py-4 pl-5 pr-12" style={{ borderColor: "var(--av-line)" }}>
            <DialogTitle className="text-[15px]">推送口径</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2.5 p-4">
            {rules.map((r) => (
              <RuleCard key={r.ruleCode} rule={r} busy={toggleRule.isPending} onToggle={(p) => toggleRule.mutate(p)} />
            ))}

            <div className="mt-1 rounded-[10px] px-3.5 py-3 text-[11.5px] leading-relaxed"
                 style={{ background: "var(--av-surface-hover)", color: "var(--av-text-dim)" }}>
              这里只管「什么时候该推」。<b style={{ fontWeight: 600 }}>渠道、免打扰、模板与接收人</b>
              在通知配置页的「饮水流量报警」源里配 —— 两种口径可以只开一种。
            </div>

            {notifyLog.length > 0 && (
              <div className="border-t pt-3" style={{ borderColor: "var(--av-line)" }}>
                <div className="mb-1.5 text-[10.5px] tracking-wide" style={{ color: "var(--av-text-soft)" }}>
                  最近推送
                </div>
                <ul className="flex flex-col gap-1">
                  {notifyLog.slice(0, 4).map((n) => (
                    <li key={n.id} className="flex items-center gap-2 text-[11.5px]">
                      <span className="av-mono shrink-0" style={{ color: "var(--av-text-dim)" }}>{fmtTime(n.notifiedAt)}</span>
                      <span className="truncate" style={{ color: "var(--av-text-dim)" }}>{n.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------ 小件

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-12">
      <span className="h-8 w-8 rounded-full" style={{ background: "var(--av-surface-hover)" }} />
      <span className="text-[13px]" style={{ color: "var(--av-text-dim)" }}>{text}</span>
    </div>
  );
}

/** RM205_A_SLV_13 → 205-A 内间 13 号点位
 *
 *  2F 的编码是「前室 + 内间 + 点位」：205 是前室，A 是内间，13 是点位号。
 *  B1 那套是「区 + 笼架盒 + 点位」（C_B106_A_SLV_4），这里统按同一口径显示。 */
function positionLabel(alarmName: string): string {
  const i = alarmName.indexOf("_SLV_");
  if (i < 0) return alarmName;
  const head = alarmName.slice(0, i).replace(/^RM/, "").replace(/^_+/, "").replace(/_/g, "-");
  return `${head} · ${alarmName.slice(i + 5)} 号点位`;
}

function fmtTime(iso: string | number | null): string {
  if (iso == null) return "—";
  const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-CN", { hour12: false });
}

/** 距触发时刻过了多久 —— 报警列表里「挂了多久」比绝对时间更有用 */
function elapsedText(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} 分钟`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时 ${min % 60} 分`;
  return `${Math.floor(hour / 24)} 天 ${hour % 24} 小时`;
}

/**
 * 报警按**平面图上的房间**归成文件夹：分区 → 内间 → 点位事件。
 * 「当前报警」和「报警历史」共用这一个渲染器，只是后者多显示结束时间与时长。
 */
function AlarmFolders({ tree, mode }: { tree: AvidityAlarmFolderTree; mode: "open" | "history" }) {
  if (!tree.rooms.length) {
    return <Empty text={mode === "open" ? "本通道此刻没有点位在报警" : "这段时间内没有报警记录"} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {tree.rooms.map((room) => (
        <div key={room.room}>
          <div className="av-folder">
            <span className="av-folder-name">{room.room}</span>
            <span className="av-folder-n">{room.count}</span>
          </div>
          {room.racks.map((rack) => (
            <div key={rack.rack} className="mt-1 pl-3">
              <div className="av-folder av-folder--sub">
                <span className="av-folder-name">{rack.rack}</span>
                <span className="av-folder-n">{rack.count}</span>
              </div>
              <ul className="mt-1 flex flex-col gap-1.5 pl-3">
                {rack.items.map((it) => (
                  <AlarmEventRow key={it.id} e={it} mode={mode} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AlarmEventRow({ e, mode }: { e: AvidityAlarmEventNode; mode: "open" | "history" }) {
  const alarm = mode === "open" || e.ongoing;
  return (
    <li
      className="relative overflow-hidden rounded-[10px] border px-3 py-2"
      style={{
        borderColor: alarm ? "color-mix(in srgb, var(--av-alarm) 34%, transparent)" : "var(--av-line)",
        background: alarm ? "var(--av-alarm-soft)" : "var(--av-surface)",
      }}
    >
      {alarm && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--av-alarm)" }} />}
      <div className="flex items-baseline gap-2.5">
        <span className="av-mono text-[13px] font-medium">
          第{e.pointNo ?? "?"}点位
        </span>
        <span className="av-mono ml-auto shrink-0 text-[11px]" style={{ color: alarm ? "var(--av-alarm)" : "var(--av-text-soft)" }}>
          {e.ongoing ? `报警中 · 已持续 ${durationText(e.durationSec)}` : durationText(e.durationSec)}
        </span>
      </div>
      <div className="av-mono mt-1 text-[11px]" style={{ color: "var(--av-text-dim)" }}>
        {fmtTime(e.startedAt)}
        <span style={{ color: "var(--av-text-soft)" }}> → </span>
        {e.endedAt ? fmtTime(e.endedAt) : "仍在报警"}
      </div>
    </li>
  );
}

/** 秒数 → 「1 小时 23 分」这种 */
function durationText(sec?: number): string {
  if (sec == null || sec < 0) return "—";
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  return `${h} 小时 ${m % 60} 分`;
}

function RuleCard({
  rule,
  busy,
  onToggle,
}: {
  rule: AvidityAlarmRule;
  busy: boolean;
  onToggle: (p: { code: string; enabled: boolean; thresholdCount?: number | null }) => void;
}) {
  const isCount = rule.ruleCode === "DAILY_COUNT";
  const [threshold, setThreshold] = useState(String(rule.thresholdCount ?? 5));

  return (
    <div className="rounded-[10px] border p-3.5" style={{ borderColor: "var(--av-line)" }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{rule.ruleName}</div>
          <div className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--av-text-dim)" }}>
            {isCount
              ? "某个点位当天累计次数首次达到阈值时推一次，同一天同一口径不重复推"
              : "平台「当前报警」里每出现一个新编号就推一次；恢复后再犯会拿到新编号，于是会重新推"}
          </div>
        </div>
        <button
          disabled={busy}
          className="av-tool shrink-0 disabled:opacity-50"
          data-active={rule.enabled}
          onClick={() => onToggle({ code: rule.ruleCode, enabled: !rule.enabled, thresholdCount: rule.thresholdCount })}
        >
          {rule.enabled ? "已开启" : "已关闭"}
        </button>
      </div>

      {isCount && rule.enabled && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "var(--av-line)" }}>
          <span className="text-[11.5px]" style={{ color: "var(--av-text-dim)" }}>当天累计达到</span>
          <input
            className="av-mono w-16 rounded-[7px] border bg-transparent px-2 py-1 text-center text-[12px] outline-none"
            style={{ borderColor: "var(--av-line-2)" }}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => onToggle({ code: rule.ruleCode, enabled: true, thresholdCount: Number(threshold) || 0 })}
          />
          <span className="text-[11.5px]" style={{ color: "var(--av-text-dim)" }}>次时推送</span>
        </div>
      )}
    </div>
  );
}
