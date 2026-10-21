import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getActive,
  getPlayMode,
  getStatus,
  listPlans,
  listSongLists,
  listZones,
  pausePlan,
  pauseZones,
  play,
  reconnect,
  relogin,
  resumePlan,
  resumeZones,
  setPlayMode,
  setVolume as setZonesVolume,
  stop,
} from "@/api/domains/broadcast.api";
import SongPanel, { type PickedSong } from "@/features/broadcast/SongPanel";
import ZonePanel from "@/features/broadcast/ZonePanel";
import PlayerBar, { type NowPlaying } from "@/features/broadcast/PlayerBar";
import ActivePlanStrip from "@/features/broadcast/ActivePlanStrip";
import { useZoneProgress } from "@/features/broadcast/useZoneProgress";
import PlanPanel from "@/features/broadcast/PlanPanel";
import PlayLogPanel from "@/features/broadcast/PlayLogPanel";

/**
 * 网络广播管理页（ADMIN+）。
 *
 * <p>**为什么有这一页**：现场广播主机自带的定时播放不可靠（播放日志连续 8 天零播放、
 * 且只执行「当前方案」）。这里由我方调度到点下发播放指令，平台降级为播放终端。
 *
 * <p>**口径（现场反馈后定的）**：定时方案只是**批量启动器**。到点把若干分区带起来之后，
 * 每一路就是独立的播放单元 —— 想停哪一路就停哪一路，方案的循环/兜底不会再把它带起来。
 * 所以左侧每个分区行有自己的播放/暂停按钮，顶部一条常驻的「正在执行」显示方案级状态。
 *
 * <p>高度按仓库里全高页的写法自己写死（`100dvh - chrome offset`）+ 逐层 `min-h-0`，
 * 每个区块各自内滚，整页不滚。标题由 AdminLayout 提供，这里不重复渲染。
 */
export default function AdminBroadcastPage() {
  const qc = useQueryClient();
  const [plansOpen, setPlansOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  // 选曲（从哪一首开始播，平台会自己接着放完整个列表）
  const [songPath, setSongPath] = useState("");
  // 勾选参与**批量**操作的分区
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 底栏音量滑条的当前值，松手才作用到已选分区 */
  const [volume, setVolume] = useState(50);

  const statusQ = useQuery({
    queryKey: ["broadcast", "status"],
    queryFn: getStatus,
    refetchInterval: 15000,
  });
  const zonesQ = useQuery({
    queryKey: ["broadcast", "zones"],
    queryFn: listZones,
    refetchInterval: 10000,
  });
  const songsQ = useQuery({ queryKey: ["broadcast", "songLists"], queryFn: listSongLists });
  const plansQ = useQuery({ queryKey: ["broadcast", "plans"], queryFn: listPlans });
  const activeQ = useQuery({
    queryKey: ["broadcast", "active"],
    queryFn: getActive,
    refetchInterval: 10000,
  });
  const playModeQ = useQuery({
    queryKey: ["broadcast", "playMode"],
    queryFn: getPlayMode,
    refetchInterval: 30000,
  });

  const zones = zonesQ.data?.zones ?? [];
  const songLists = songsQ.data ?? [];
  const macs = useMemo(() => [...selected], [selected]);
  const canApplyVolume = selected.size > 0;

  const activePlans = activeQ.data?.plans ?? [];
  /** 被人工停过的分区（方案不会自动恢复它们） */
  const pausedMacs = useMemo(() => {
    const s = new Set<string>();
    for (const p of activePlans) {
      for (const z of p.zones) {
        if (z.paused) s.add(z.mac);
      }
    }
    return s;
  }, [activePlans]);

  // 逐分区真实进度（曲名 + 时长推算）。底栏那条取「已选分区里第一个在播的」
  const progress = useZoneProgress(zones, songLists);
  const nowPlaying: NowPlaying | null = (() => {
    const z = zones.find((x) => x.playing && (selected.size === 0 || selected.has(x.mac)));
    if (!z) return null;
    const p = progress.get(z.mac);
    return p ? { song: p.song, position: p.position, duration: p.duration, ratio: p.ratio } : null;
  })();

  /**
   * 只刷该刷的那一块。
   *
   * <p>原来每次操作都 invalidate 整个 broadcast 前缀，连分区列表一起重取 ——
   * 调个音量、暂停一路，左边分区列表都跟着"刷一下"。分区状态本来就有 10 秒轮询兜着，
   * 没必要每次操作都重拉。
   */
  const refreshZones = () => qc.invalidateQueries({ queryKey: ["broadcast", "zones"] });
  const refreshActive = () => qc.invalidateQueries({ queryKey: ["broadcast", "active"] });
  const refreshPlans = () => qc.invalidateQueries({ queryKey: ["broadcast", "plans"] });
  const refreshStatusAndZones = () => {
    qc.invalidateQueries({ queryKey: ["broadcast", "status"] });
    refreshZones();
  };

  const reconnectMut = useMutation({
    mutationFn: reconnect,
    onSuccess: () => {
      toast.success("已发起重连");
      refreshStatusAndZones();
    },
    onError: (e: Error) => toast.error(e.message || "重连失败"),
  });

  const reloginMut = useMutation({
    mutationFn: relogin,
    onSuccess: () => {
      toast.success("已发起重新登录");
      refreshStatusAndZones();
    },
    onError: (e: Error) => toast.error(e.message || "重新登录失败"),
  });

  const playMut = useMutation({
    // 不带音量：底栏音量滑条是独立的一步（松手即对已选分区生效），别在播放时顺手改掉各分区自己的音量
    mutationFn: () => play(macs, songPath, null),
    onSuccess: () => {
      toast.success("已下发播放");
      refreshZones();
      refreshActive();
    },
    onError: (e: Error) => toast.error(e.message || "播放失败"),
  });

  const stopMut = useMutation({
    mutationFn: () => stop(macs),
    onSuccess: () => {
      toast.success("已下发停止");
      refreshZones();
      refreshActive();
    },
    onError: (e: Error) => toast.error(e.message || "停止失败"),
  });

  const volumeMut = useMutation({
    mutationFn: (args: { macs: string[]; volume: number }) => setZonesVolume(args.macs, args.volume),
    onSuccess: () => {
      refreshZones();
    },
    onError: (e: Error) => toast.error(e.message || "设置音量失败"),
  });

  /** 单分区播放/暂停：只动这一路 */
  const zoneMut = useMutation({
    mutationFn: (args: { macs: string[]; resume: boolean; songPath?: string }) =>
      args.resume ? resumeZones(args.macs, args.songPath) : pauseZones(args.macs),
    onSuccess: (_d, args) => {
      toast.success(args.resume ? "已恢复该分区" : "已暂停该分区");
      refreshZones();
      refreshActive();
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });

  /** 方案级暂停/恢复 */
  const planRunMut = useMutation({
    mutationFn: (args: { id: number; resume: boolean }) =>
      args.resume ? resumePlan(args.id) : pausePlan(args.id),
    onSuccess: (_d, args) => {
      toast.success(args.resume ? "方案已恢复" : "方案已暂停");
      refreshZones();
      refreshActive();
      refreshPlans();
    },
    onError: (e: Error) => toast.error(e.message || "操作失败"),
  });

  /** 播放模式（平台全局） */
  const playModeMut = useMutation({
    mutationFn: (mode: number) => setPlayMode(mode),
    onSuccess: (r) => {
      toast.success(`已切换为${r.text}`);
      qc.invalidateQueries({ queryKey: ["broadcast", "playMode"] });
    },
    onError: (e: Error) => toast.error(e.message || "切换失败"),
  });

  function onToggleZone(mac: string) {
    const next = new Set(selected);
    if (next.has(mac)) next.delete(mac);
    else next.add(mac);
    setSelected(next);
  }

  function onSelectAll(all: boolean) {
    setSelected(all ? new Set(zones.map((z) => z.mac)) : new Set());
  }

  function onPickSong(s: PickedSong) {
    setSongPath(s.pathName);
  }

  return (
    <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-2">
      {/* 正在执行什么，一眼可见；方案级暂停/恢复就在这里 */}
      <ActivePlanStrip
        plans={activePlans}
        loading={activeQ.isLoading}
        busyPlanId={planRunMut.isPending ? (planRunMut.variables?.id ?? null) : null}
        onPausePlan={(id) => planRunMut.mutate({ id, resume: false })}
        onResumePlan={(id) => planRunMut.mutate({ id, resume: true })}
      />

      {/* 主次分明的两栏：分区靠左占三成（是"选谁"的清单），音乐靠右占七成（是主体） */}
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[3fr_7fr]">
        <ZonePanel
          zones={zones}
          loading={zonesQ.isLoading}
          hint={zonesQ.data?.loggedIn ? "未读取到分区" : "广播平台未登录，点底栏「重新登录」"}
          selected={selected}
          pausedMacs={pausedMacs}
          progress={progress}
          onToggle={onToggleZone}
          onSelectAll={onSelectAll}
          onVolumeCommit={(mac, v) => volumeMut.mutate({ macs: [mac], volume: v })}
          onZonePlay={(mac) => zoneMut.mutate({ macs: [mac], resume: true, songPath })}
          onZonePause={(mac) => zoneMut.mutate({ macs: [mac], resume: false })}
        />
        <SongPanel lists={songLists} loading={songsQ.isLoading} songPath={songPath} onPick={onPickSong} />
      </div>

      <PlayerBar
        status={statusQ.data}
        planCount={(plansQ.data ?? []).length}
        nowPlaying={nowPlaying}
        zoneCount={selected.size}
        volume={volume}
        onVolumeApply={(v) => {
          setVolume(v);
          volumeMut.mutate({ macs, volume: v });
        }}
        playMode={playModeQ.data?.mode ?? 3}
        onPlayModeChange={(m) => playModeMut.mutate(m)}
        canPlay={selected.size > 0 && !!songPath}
        canStop={selected.size > 0}
        canApplyVolume={canApplyVolume}
        playing={playMut.isPending}
        reconnecting={reconnectMut.isPending}
        relogging={reloginMut.isPending}
        onPlay={() => playMut.mutate()}
        onStop={() => stopMut.mutate()}
        onReconnect={() => reconnectMut.mutate()}
        onRelogin={() => reloginMut.mutate()}
        onOpenPlans={() => setPlansOpen(true)}
        onOpenLogs={() => setLogsOpen(true)}
      />

      {/* 收纳入口：定时方案 */}
      <Dialog open={plansOpen} onOpenChange={setPlansOpen}>
        <DialogContent className="flex h-[86vh] w-[94vw] max-w-[1200px] flex-col gap-2 p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>定时播放方案</DialogTitle>
          </DialogHeader>
          <PlanPanel />
        </DialogContent>
      </Dialog>

      {/* 收纳入口：播放记录 */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="flex h-[86vh] w-[94vw] max-w-[1000px] flex-col gap-2 p-4">
          <DialogHeader className="sr-only">
            <DialogTitle>播放记录</DialogTitle>
          </DialogHeader>
          <PlayLogPanel />
        </DialogContent>
      </Dialog>
    </div>
  );
}
