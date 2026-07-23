import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAnimalOrderRanking,
  fetchGroupRanking,
  fetchLineChartData,
  fetchPieChartData,
  fetchRetentionWarnings,
  type DashboardStatsResponse,
  type LineStats,
} from "@/api/twinApi";
import { fetchPublicRuntimeConfig } from "@/api/domains/notification.api";
import {
  fetchDashboardViolationBoard,
  type DashboardViolationBoardResponse,
} from "@/api/domains/dashboardViolationBoard.api";
import { useEventStore } from "@/store/useEventStore";

export type OpsWallRegion = "TOTAL" | "PUDONG" | "PUXI";
export type OpsWallCampusTab = "pudong" | "puxi";

export type RetentionRow = Record<string, unknown>;

export type OpsPresenceCard = {
  id: string;
  userName: string;
  groupName: string;
  roomName: string;
  areaName: string;
  enterClock: string;
  enterDate: string;
  passedMins: number;
  aiDurationMins: number;
  cardKind: "own" | "borrowed" | "shared" | "keep";
};

const LINE_POLL_MS = 60_000;
const RETENTION_POLL_MS = 30_000;
const RULES_POLL_MS = 120_000;

function toPresenceCards(rows: RetentionRow[], now: Date): OpsPresenceCard[] {
  const nowMs = now.getTime();
  return rows.map((r) => {
    const enterTime = String(r.enterTime ?? "");
    const enterDate = new Date(enterTime.replace(" ", "T"));
    const passedMins = Number.isFinite(enterDate.getTime())
      ? Math.max(0, Math.floor((nowMs - enterDate.getTime()) / 60000))
      : 0;
    const aiDurationMins = Number(r.aiDurationMins) || 120;
    const parts = enterTime.split(" ");
    const datePart = parts[0] ?? "";
    const clockPart = parts[1]?.substring(0, 5) ?? "--:--";
    const isOwn = !!(r.is_own_card ?? r.isOwnCard);
    const isShared = !!(r.is_shared_card ?? r.isSharedCard);
    const isKeep = !!(r.is_keep_card ?? r.isKeepCard);
    let cardKind: OpsPresenceCard["cardKind"] = "borrowed";
    if (isKeep) cardKind = "keep";
    else if (isShared) cardKind = "shared";
    else if (isOwn) cardKind = "own";
    return {
      id: String(r.logId ?? `${enterTime}-${r.userName}`),
      userName: String(r.userName ?? "未知"),
      groupName: String(r.groupName ?? "未知课题组"),
      roomName: String(r.roomName ?? "未知房间"),
      areaName: String(r.areaName ?? ""),
      enterClock: clockPart,
      enterDate: datePart,
      passedMins,
      aiDurationMins,
      cardKind,
    };
  });
}

const CARD_KIND_LABEL: Record<OpsPresenceCard["cardKind"], string> = {
  own: "自带卡",
  borrowed: "领用公卡",
  shared: "同行共享",
  keep: "延迟还卡",
};

export function getCardKindLabel(kind: OpsPresenceCard["cardKind"]): string {
  return CARD_KIND_LABEL[kind];
}

export function useOpsWallData() {
  const pieStats = useEventStore((s) => s.pieStats);
  const setPieStats = useEventStore((s) => s.setPieStats);
  const isConnected = useEventStore((s) => s.isConnected);
  const realtimeEvents = useEventStore((s) => s.realtimeEvents);

  const [coldPie, setColdPie] = useState<DashboardStatsResponse | null>(null);
  const [lineData, setLineData] = useState<LineStats | null>(null);
  const [lineLoading, setLineLoading] = useState(true);
  const [retentionRows, setRetentionRows] = useState<RetentionRow[]>([]);
  const [retentionLoading, setRetentionLoading] = useState(true);
  const [violationBoard, setViolationBoard] = useState<DashboardViolationBoardResponse | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (pieStats) return;
    let cancelled = false;
    (async () => {
      try {
        const d = (await fetchPieChartData()) as DashboardStatsResponse;
        if (!cancelled && d) {
          setPieStats(d);
          setColdPie(d);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pieStats, setPieStats]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const d = await fetchLineChartData();
        if (!cancelled && d && Array.isArray(d.times)) {
          setLineData(d as LineStats);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLineLoading(false);
      }
    };
    load();
    const iv = setInterval(load, LINE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [pd, px] = await Promise.all([
          fetchRetentionWarnings(100, "浦东"),
          fetchRetentionWarnings(100, "浦西"),
        ]);
        if (!cancelled) setRetentionRows([...(pd || []), ...(px || [])]);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setRetentionLoading(false);
      }
    };
    load();
    const iv = setInterval(load, RETENTION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const vb = await fetchDashboardViolationBoard();
        if (!cancelled) setViolationBoard(vb);
      } catch {
        /* ignore */
      }
    };
    load();
    const iv = setInterval(load, RULES_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const { data: runtimeConfig } = useQuery({
    queryKey: ["ops-wall-runtime-config"],
    queryFn: fetchPublicRuntimeConfig,
    staleTime: 60_000,
    refetchInterval: RULES_POLL_MS,
  });

  const stats = pieStats || coldPie;
  const pudongTotal = stats?.pudongTotal ?? 0;
  const puxiTotal = stats?.puxiTotal ?? 0;
  const grandTotal = pudongTotal + puxiTotal;

  const presenceCards = useMemo(() => toPresenceCards(retentionRows, now), [retentionRows, now]);
  const pudongCards = useMemo(
    () => presenceCards.filter((c) => c.areaName.includes("浦东")),
    [presenceCards],
  );
  const puxiCards = useMemo(
    () => presenceCards.filter((c) => c.areaName.includes("浦西")),
    [presenceCards],
  );

  const roomBars = useMemo(() => {
    const pudongRooms = stats?.pudongPie ?? [];
    const puxiRooms = stats?.puxiPie ?? [];
    return [
      ...pudongRooms.map((r) => ({ ...r, campus: "pudong" as const })),
      ...puxiRooms.map((r) => ({ ...r, campus: "puxi" as const })),
    ].sort((a, b) => b.value - a.value);
  }, [stats]);

  const recentEnters = useMemo(
    () => realtimeEvents.filter((e) => e.action === "ENTER").slice(0, 8),
    [realtimeEvents],
  );

  return {
    stats,
    pudongTotal,
    puxiTotal,
    grandTotal,
    roomBars,
    lineData,
    lineLoading,
    presenceCards,
    pudongCards,
    puxiCards,
    retentionLoading,
    runtimeConfig: runtimeConfig as Record<string, string> | undefined,
    violationBoard,
    isConnected,
    realtimeEvents,
    recentEnters,
    now,
  };
}

export type OpsWallData = ReturnType<typeof useOpsWallData>;

export function useOpsWallRankings(region: OpsWallRegion) {
  const { data: groupRank = [], isLoading } = useQuery({
    queryKey: ["ops-wall-ranking", "MONTH", region],
    queryFn: () => fetchGroupRanking("MONTH", region),
    refetchInterval: 300_000,
  });

  const { data: animalRank = [] } = useQuery({
    queryKey: ["ops-wall-animal-ranking", region],
    queryFn: () => fetchAnimalOrderRanking(region),
    refetchInterval: 300_000,
  });

  return {
    groupRank: Array.isArray(groupRank) ? groupRank : [],
    animalRank: Array.isArray(animalRank) ? animalRank : [],
    isLoading,
  };
}
