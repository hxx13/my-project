/** 首页进出状态 — 事件驱动拉取（WebSocket 通知）+ 本地秒级计时 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMobileRoomDashboard,
  type MobileRoomAnalyzeDto,
  type MobileRoomDashboardData,
  type MobileRoomOverviewRow,
} from "@/api/domains/mobileStudent.api";
import { fetchStudentMobileRoomDashboard, fetchStudentMobileExemptStatus } from "@/api/domains/studentMobile.api";
import type { ExemptStatus } from "@/api/domains/mobileStudent.api";
import { formatExemptRemaining } from "@/constants/exemptDurationPresets";
import {
  hasActiveAutoSignoutCountdown,
  remainingSecondsFromScheduledAt,
} from "@/utils/formatCountdown";

function occupantUserId(occ: MobileRoomDashboardOccupantLike): string {
  return String(occ.userId ?? occ.user_id ?? "").trim();
}

type MobileRoomDashboardOccupantLike = {
  userId?: string;
  user_id?: string;
  entryTime?: string;
  entry_time?: string;
};

function findSelfInOverview(
  overview: MobileRoomOverviewRow[],
  userId: string | undefined,
): { roomName: string; entryTime: string | null } | null {
  if (!userId) return null;
  const uid = userId.trim();
  for (const room of overview) {
    for (const occ of room.occupants ?? []) {
      const o = occ as MobileRoomDashboardOccupantLike;
      if (occupantUserId(o) === uid) {
        return {
          roomName: room.roomName ?? "未知房间",
          entryTime: o.entryTime ?? o.entry_time ?? null,
        };
      }
    }
  }
  return null;
}

function roomLabelFromPending(room: Record<string, unknown>): string {
  const candidates = [
    room.displayName,
    room.name,
    room.roomName,
    room.officialRoomName,
  ];
  for (const c of candidates) {
    const text = String(c ?? "").trim();
    if (text) return text;
  }
  return "";
}

/** INSIDE 时房间名：overview 在场人员优先，否则用 analyze.pendingRooms（与扫码弹窗同源） */
function resolveInsideRoom(
  overview: MobileRoomOverviewRow[],
  userId: string | undefined,
  analyze: MobileRoomAnalyzeDto,
): { roomName: string | null; entryTime: string | null } {
  const fromOverview = findSelfInOverview(overview, userId);
  const pending = Array.isArray(analyze.pendingRooms) ? analyze.pendingRooms : [];
  const pendingNames = [
    ...new Set(pending.map((r) => roomLabelFromPending(r)).filter(Boolean)),
  ];

  if (fromOverview?.roomName) {
    return {
      roomName: fromOverview.roomName,
      entryTime: fromOverview.entryTime,
    };
  }
  if (pendingNames.length > 0) {
    return {
      roomName: pendingNames.join("、"),
      entryTime: fromOverview?.entryTime ?? null,
    };
  }
  return { roomName: null, entryTime: fromOverview?.entryTime ?? null };
}

function parseEntryMs(entryTime: string | null | undefined): number | null {
  const raw = (entryTime ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(ms) ? ms : null;
}

export function formatElapsedDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type MobilePresenceSnapshot = {
  loading: boolean;
  currentState: "INSIDE" | "OUTSIDE" | "UNKNOWN";
  roomName: string | null;
  dwellSeconds: number | null;
  autoSignoutState: string | null;
  autoSignoutScheduledAt: string | null;
  countdownSeconds: number | null;
  inPendingActivation: boolean;
  inAutoExitScheduled: boolean;
  lastSyncedAt: number | null;
  exemptStatus: ExemptStatus | null;
};

/**
 * @param refreshNonce 递增时拉取 room-dashboard（首次进入、WebSocket presence 通知）
 */
export function useMobilePresenceStatus(
  token: string | undefined,
  refreshNonce = 0,
  jwtMode = false,
): MobilePresenceSnapshot {
  const [bundle, setBundle] = useState<MobileRoomDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (jwtMode) {
      try {
        const data = await fetchStudentMobileRoomDashboard();
        setBundle(data);
        setLastSyncedAt(Date.now());
      } catch {
        /* 静默 */
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!token) return;
    try {
      const data = await fetchMobileRoomDashboard(token);
      setBundle(data);
      setLastSyncedAt(Date.now());
    } catch {
      /* 静默 */
    } finally {
      setLoading(false);
    }
  }, [token, jwtMode]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  /** JWT 模式：独立拉取豁免状态 */
  const [exemptState, setExemptState] = useState<ExemptStatus | null>(null);

  useEffect(() => {
    if (!jwtMode) return;
    let cancelled = false;
    fetchStudentMobileExemptStatus()
      .then((data) => {
        if (!cancelled) setExemptState(data);
      })
      .catch(() => {
        // 静默失败
      });
    return () => { cancelled = true; };
  }, [jwtMode, refreshNonce]);

  /** 仅本地 UI 计时，不发起 HTTP */
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    void tick;
    const analyze = bundle?.analyze ?? {};
    const rawState = (analyze.currentState ?? "UNKNOWN").toUpperCase();
    const currentState =
      rawState === "INSIDE" || rawState === "OUTSIDE"
        ? (rawState as "INSIDE" | "OUTSIDE")
        : "UNKNOWN";

    const insideRoom =
      currentState === "INSIDE"
        ? resolveInsideRoom(bundle?.overview ?? [], bundle?.userId, analyze)
        : { roomName: null, entryTime: null };
    const entryMs = parseEntryMs(insideRoom.entryTime);
    const dwellSeconds =
      currentState === "INSIDE" && entryMs != null
        ? Math.max(0, Math.floor((Date.now() - entryMs) / 1000))
        : null;

    const autoState = analyze.autoSignoutState ?? null;
    const scheduledAt = analyze.autoSignoutScheduledAt ?? null;
    const fromDeadline = remainingSecondsFromScheduledAt(scheduledAt);
    const countdownSeconds = hasActiveAutoSignoutCountdown({
      autoSignoutScheduledAt: scheduledAt,
      autoSignoutSecondsRemaining: analyze.autoSignoutSecondsRemaining,
    })
      ? fromDeadline ?? analyze.autoSignoutSecondsRemaining ?? null
      : null;

    // 豁免状态：Token 模式从 analyze 取，JWT 模式从独立接口取
    let exempt: ExemptStatus | null = null;
    if (jwtMode) {
      exempt = exemptState;
    } else {
      const raw = (analyze as any).exemptStatus;
      exempt = (raw && raw.phase && raw.phase !== "none") ? (raw as ExemptStatus) : null;
    }

    // 实时计算剩余时长
    if (exempt && exempt.phase === "approved_active" && exempt.expireAt) {
      const remaining = formatExemptRemaining(exempt.expireAt);
      if (remaining === "已到期") {
        exempt = { ...exempt, phase: "approved_expired" as const, remainingText: "已到期" };
      } else {
        exempt = { ...exempt, remainingText: remaining };
      }
    }

    return {
      loading,
      currentState,
      roomName: insideRoom.roomName,
      dwellSeconds,
      autoSignoutState: autoState,
      autoSignoutScheduledAt: scheduledAt,
      countdownSeconds,
      inPendingActivation: autoState === "PENDING_ACTIVATION" && (countdownSeconds ?? 0) > 0,
      inAutoExitScheduled: autoState === "AUTO_EXIT_SCHEDULED" && (countdownSeconds ?? 0) > 0,
      lastSyncedAt,
      exemptStatus: exempt,
    };
  }, [bundle, loading, tick, lastSyncedAt, exemptState, jwtMode]);
}

/** WebSocket refresh 是否应触发进出状态重拉 */
export function isPresenceRefreshNotify(payload: { kind?: string; reason?: string } | null): boolean {
  if (!payload) return false;
  if (payload.kind === "presence_refresh") return true;
  if (payload.kind === "refresh") {
    const reason = payload.reason ?? "";
    return reason.startsWith("presence:");
  }
  return false;
}
