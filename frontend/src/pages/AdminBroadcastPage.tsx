import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getStatus,
  listPlans,
  listSongLists,
  listZones,
  play,
  reconnect,
  relogin,
  setVolume as setZonesVolume,
  stop,
} from "@/api/domains/broadcast.api";
import SongPanel, { type PickedSong } from "@/features/broadcast/SongPanel";
import ZonePanel from "@/features/broadcast/ZonePanel";
import PlayerBar from "@/features/broadcast/PlayerBar";
import PlanPanel from "@/features/broadcast/PlanPanel";
import PlayLogPanel from "@/features/broadcast/PlayLogPanel";

/**
 * 网络广播管理页（ADMIN+）。
 *
 * <p>**为什么有这一页**：现场广播主机自带的定时播放不可靠（播放日志连续 8 天零播放、
 * 且只执行「当前方案」）。这里由我方调度到点下发播放指令，平台降级为播放终端。
 *
 * <p>排布照**现代音乐播放器**：主区只有两栏（选曲 | 选分区），
 * 传输控制、当前曲目、音量、两个收纳入口、连接状态全都收进**底部一条播放条**。
 * 早先把操作单独摆成中间一列，又窄又白占一栏宽度；合成底栏后主区更干净。
 *
 * <p>高度按仓库里全高页的写法自己写死（`100dvh - chrome offset`）+ 逐层 `min-h-0`，
 * 每个区块各自内滚，整页不滚。标题由 AdminLayout 提供，这里不重复渲染。
 */
export default function AdminBroadcastPage() {
  const qc = useQueryClient();
  const [plansOpen, setPlansOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  // 选曲（单选：从哪一首开始播，平台会自己接着放完整个列表）
  const [songPath, setSongPath] = useState("");
  const [songName, setSongName] = useState("");
  // 勾选参与操作的分区
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

  const zones = zonesQ.data?.zones ?? [];
  const macs = useMemo(() => [...selected], [selected]);
  const playingCount = zones.filter((z) => z.playing && selected.has(z.mac)).length;
  const canApplyVolume = selected.size > 0;
  /** 当前曲目总时长；平台不给进度，只有时长这一半信息，进度条靠它渲染 */
  const songDuration = useMemo(() => {
    const all = (songsQ.data ?? []).flatMap((l) => l.songs);
    return all.find((s) => s.pathName === songPath)?.durationSeconds ?? null;
  }, [songsQ.data, songPath]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["broadcast"] });

  const reconnectMut = useMutation({
    mutationFn: reconnect,
    onSuccess: () => {
      toast.success("已发起重连");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "重连失败"),
  });

  const reloginMut = useMutation({
    mutationFn: relogin,
    onSuccess: () => {
      toast.success("已发起重新登录");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "重新登录失败"),
  });

  const playMut = useMutation({
    // 不带音量：底栏音量滑条是独立的一步（松手即对已选分区生效），别在播放时顺手改掉各分区自己的音量
    mutationFn: () => play(macs, songPath, null),
    onSuccess: () => {
      toast.success("已下发播放");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "播放失败"),
  });

  const stopMut = useMutation({
    mutationFn: () => stop(macs),
    onSuccess: () => {
      toast.success("已下发停止");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "停止失败"),
  });

  const volumeMut = useMutation({
    mutationFn: (args: { macs: string[]; volume: number }) => setZonesVolume(args.macs, args.volume),
    onSuccess: () => {
      toast.success("音量已设置");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "设置音量失败"),
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
    setSongName(s.fileName);
  }

  return (
    <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-2">
      {/* 主次分明的两栏：分区靠左占三成（是"选谁"的清单），音乐靠右占七成（是主体） */}
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[3fr_7fr]">
        <ZonePanel
          zones={zones}
          loading={zonesQ.isLoading}
          hint={zonesQ.data?.loggedIn ? "未读取到分区" : "广播平台未登录，点底栏「重新登录」"}
          selected={selected}
          onToggle={onToggleZone}
          onSelectAll={onSelectAll}
          onVolumeCommit={(mac, v) => volumeMut.mutate({ macs: [mac], volume: v })}
        />
        <SongPanel lists={songsQ.data ?? []} loading={songsQ.isLoading} songPath={songPath} onPick={onPickSong} />
      </div>

      <PlayerBar
        status={statusQ.data}
        planCount={(plansQ.data ?? []).length}
        songName={songName}
        songDuration={songDuration}
        zoneCount={selected.size}
        playingCount={playingCount}
        volume={volume}
        onVolumeApply={(v) => {
          setVolume(v);
          volumeMut.mutate({ macs, volume: v });
        }}
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
