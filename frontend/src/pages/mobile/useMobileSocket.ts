import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { resolveSocketUrl, SOCKET_IO_CLIENT_OPTIONS, APP_BUILD_ID } from "@/config/socketUrl";
import { authStorage } from "@/features/auth/authStorage";
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import { isFeedbackKind } from "./mobileAlertSplit";

export interface MobileAlert {
  title: string;
  summary: string;
  type: "PLATFORM" | "ARO" | "WORK_ORDER";
  at: string;
}

export interface MobileUserNotifyPayload {
  kind?: string;
  title?: string;
  summary?: string;
  contentHtml?: string;
  bizType?: string;
  bizId?: string;
  notificationId?: string;
  id?: string | number;
  reason?: string;
  at?: string;
}

interface UseMobileSocketReturn {
  connected: boolean;
  lastAlert: MobileAlert | null;
  lastUserNotify: MobileUserNotifyPayload | null;
  clearUserNotify: () => void;
}

/**
 * 手机端 HTML5 WebSocket：
 * - MOBILE_ALERT：全局广播
 * - MOBILE_USER_NOTIFY：携带 mobileToken 时接收本人物资/延迟审核等推送
 */
export function useMobileSocket(mobileToken?: string, jwtMode = false): UseMobileSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastAlert, setLastAlert] = useState<MobileAlert | null>(null);
  const [lastUserNotify, setLastUserNotify] = useState<MobileUserNotifyPayload | null>(null);

  useEffect(() => {
    const socketUrl = resolveSocketUrl();
    const query: Record<string, string> = {};
    if (jwtMode) {
      query.channel = "student";
      query.token = authStorage.getToken();
    } else {
      query.channel = "mobile";
      if (mobileToken?.trim()) {
        query.mobileToken = mobileToken.trim();
      }
    }
    query.v = APP_BUILD_ID;
    const socket = io(socketUrl, {
      ...SOCKET_IO_CLIENT_OPTIONS,
      query,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("MOBILE_ALERT", (payload: MobileAlert) => {
      setLastAlert(payload);
    });

    socket.on("MOBILE_USER_NOTIFY", (payload: MobileUserNotifyPayload) => {
      setLastUserNotify(payload);
    });

    return () => {
      socket.off("MOBILE_ALERT");
      socket.off("MOBILE_USER_NOTIFY");
      socket.disconnect();
    };
  }, [mobileToken, jwtMode]);

  const clearUserNotify = useCallback(() => setLastUserNotify(null), []);

  return { connected, lastAlert, lastUserNotify, clearUserNotify };
}

/** 将 WebSocket 推送合并进通知列表（去重） */
export function mergeMobileUserNotify(
  items: MobileAlertItem[],
  payload: MobileUserNotifyPayload,
): MobileAlertItem[] {
  if (payload.kind === "refresh") {
    return items;
  }
  const kind = payload.kind as MobileAlertItem["kind"] | undefined;
  if (!kind || !isFeedbackKind(kind)) {
    return items;
  }
  const next: MobileAlertItem = {
    kind,
    id: payload.id ?? payload.notificationId ?? payload.bizId ?? Date.now(),
    title: payload.title ?? "新通知",
    contentHtml: payload.contentHtml ?? (payload.summary ? `<p>${payload.summary}</p>` : ""),
    interactiveRequired: false,
    bizType: payload.bizType,
    bizId: payload.bizId,
    notificationId: payload.notificationId,
    createdAt: payload.at ?? new Date().toISOString(),
  };
  const key = `${next.kind}-${next.notificationId ?? next.bizId ?? next.id}`;
  const filtered = items.filter(
    (it) => `${it.kind}-${it.notificationId ?? it.bizId ?? it.id}` !== key,
  );
  return [next, ...filtered];
}
