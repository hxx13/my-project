import { create } from "zustand";
import {
  markBizNotificationsReadSynced,
  NOTIFICATION_READ_CHANGED_EVENT,
  type NotificationReadChangedDetail,
} from "@/features/notification/notificationReadSync";

const ACK_READ_STORAGE_KEY = "scan-delay-alert:ack-read-ids";

export type ScanDelayReviewAlertPayload = {
  requestId: string;
  notificationId?: string;
  title: string;
  summary: string;
};

export type ScanDelayPendingAlertSource = {
  id: number;
  subjectDisplayName?: string;
  subjectGroupName?: string;
  approvedCount?: number;
  optionLabel?: string;
  roomName?: string;
};

type ScanDelayReviewAlertState = {
  island: ScanDelayReviewAlertPayload | null;
  banner: ScanDelayReviewAlertPayload | null;
  /** 本会话暂时关闭横幅（路由切换/刷新后会重新评估） */
  dismissedRequestIds: Set<string>;
  osNotifiedIds: Set<string>;
  showAlert: (payload: ScanDelayReviewAlertPayload) => void;
  syncFromPendingList: (items: ScanDelayPendingAlertSource[]) => void;
  markAlertRead: (requestId: string) => Promise<void>;
  dismissBannerForSession: (requestId: string) => void;
  dismissIsland: () => void;
  dismissBanner: () => void;
  resetForNavigation: () => void;
};

function loadAckReadIds(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(ACK_READ_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((x) => String(x).trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function persistAckReadIds(ids: Set<string>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ACK_READ_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

function addAckReadId(requestId: string) {
  const id = requestId.trim();
  if (!id) return;
  const next = loadAckReadIds();
  next.add(id);
  persistAckReadIds(next);
}

function isAckRead(requestId: string): boolean {
  return loadAckReadIds().has(requestId.trim());
}

function buildSummary(item: ScanDelayPendingAlertSource): string {
  const name = item.subjectDisplayName?.trim() || "待审人员";
  const group = item.subjectGroupName?.trim() || "未标注课题组";
  const approved = item.approvedCount ?? 0;
  const room = item.roomName?.trim() || "";
  const option = item.optionLabel?.trim() || "延迟免冻结";
  const place = room ? `${room} · ${option}` : option;
  return `${name} · ${group} · 历史已通过 ${approved} 次 · ${place}`;
}

function pickAlertTarget(
  items: ScanDelayPendingAlertSource[],
  dismissedRequestIds: Set<string>
): { newest: ScanDelayPendingAlertSource; remindable: ScanDelayPendingAlertSource[] } | null {
  const remindable = items.filter((item) => {
    const id = String(item.id);
    if (!id || isAckRead(id)) return false;
    return !dismissedRequestIds.has(id);
  });
  if (!remindable.length) return null;

  const sorted = [...remindable].sort((a, b) => Number(b.id) - Number(a.id));
  return { newest: sorted[0], remindable: sorted };
}

export const useScanDelayReviewAlertStore = create<ScanDelayReviewAlertState>((set, get) => ({
  island: null,
  banner: null,
  dismissedRequestIds: new Set<string>(),
  osNotifiedIds: new Set<string>(),

  showAlert: (payload) => {
    const id = payload.requestId?.trim();
    if (!id || isAckRead(id)) return;
    const state = get();
    if (state.dismissedRequestIds.has(id)) return;

    set({
      island: payload,
      banner: payload,
    });

    if (typeof document !== "undefined" && document.hidden && !state.osNotifiedIds.has(id)) {
      void showOsNotification(payload).then((ok) => {
        if (ok) {
          const osSet = new Set(get().osNotifiedIds);
          osSet.add(id);
          set({ osNotifiedIds: osSet });
        }
      });
    }
  },

  /** 未审核且未点已读：每次刷新/路由进入都会再次提醒 */
  syncFromPendingList: (items) => {
    if (!items?.length) return;
    const target = pickAlertTarget(items, get().dismissedRequestIds);
    if (!target) {
      set({ banner: null, island: null });
      return;
    }

    const { newest, remindable } = target;
    const id = String(newest.id);
    const title =
      remindable.length > 1 ? `延迟免冻结待审核（${remindable.length} 条）` : "延迟免冻结待审核";
    const summary =
      remindable.length > 1
        ? `${buildSummary(newest)} · 另有 ${remindable.length - 1} 条待审`
        : buildSummary(newest);

    get().showAlert({ requestId: id, title, summary });
  },

  markAlertRead: async (requestId) => {
    const id = requestId.trim();
    if (!id) return;
    try {
      await markBizNotificationsReadSynced("SCAN_DELAY", id);
    } catch {
      /* 仍本地记已读，避免反复打扰 */
    }
    addAckReadId(id);
    set((state) => ({
      banner: state.banner?.requestId === id ? null : state.banner,
      island: state.island?.requestId === id ? null : state.island,
    }));
  },

  /** 仅本页面临时关闭，刷新或切换链接后会再次提醒 */
  dismissBannerForSession: (requestId) => {
    const id = requestId.trim();
    if (!id) return;
    set((state) => {
      const dismissedRequestIds = new Set(state.dismissedRequestIds);
      dismissedRequestIds.add(id);
      return {
        dismissedRequestIds,
        banner: state.banner?.requestId === id ? null : state.banner,
      };
    });
  },

  dismissIsland: () => set({ island: null }),

  dismissBanner: () => set({ banner: null }),

  resetForNavigation: () =>
    set({
      banner: null,
      island: null,
      dismissedRequestIds: new Set<string>(),
    }),
}));

async function showOsNotification(payload: ScanDelayReviewAlertPayload): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  let perm = Notification.permission;
  if (perm === "default") {
    try {
      perm = await Notification.requestPermission();
    } catch {
      return false;
    }
  }
  if (perm !== "granted") return false;
  try {
    new Notification(payload.title || "延迟免冻结待审核", {
      body: payload.summary || "有新的延迟免冻结申请待您审核",
      tag: `scan-delay-${payload.requestId}`,
    });
    return true;
  } catch {
    return false;
  }
}

export function scanDelayReviewHash(requestId?: string): string {
  const base = "#/admin/material/review?tab=scanDelay";
  if (!requestId) return base;
  return `${base}&requestId=${encodeURIComponent(requestId)}`;
}

function pickStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return "";
}

export function handleScanDelayNotificationSse(data: unknown): void {
  if (!data || typeof data !== "object") return;
  const row = data as Record<string, unknown>;
  const bizType = pickStr(row, "bizType", "biz_type").toUpperCase();
  const eventType = pickStr(row, "eventType", "event_type").toUpperCase();
  if (bizType !== "SCAN_DELAY" || eventType !== "CREATED") return;

  const requestId = pickStr(row, "bizId", "biz_id", "requestId", "request_id");
  if (!requestId || isAckRead(requestId)) return;

  const title = pickStr(row, "title") || "延迟免冻结待审核";
  const summary = pickStr(row, "summary", "content") || title;

  useScanDelayReviewAlertStore.getState().showAlert({
    requestId,
    notificationId: pickStr(row, "id") || undefined,
    title,
    summary,
  });
}

/** 消息中心 / 工单列表标记已读后，停止强提醒 */
export function bindScanDelayAlertReadListener(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent<NotificationReadChangedDetail>).detail;
    if (!detail) return;
    if (detail.all) {
      useScanDelayReviewAlertStore.setState({ banner: null, island: null });
      return;
    }
    const bizType = String(detail.bizType ?? "").trim().toUpperCase();
    const bizId = String(detail.bizId ?? "").trim();
    if (bizType !== "SCAN_DELAY" || !bizId) return;
    addAckReadId(bizId);
    const state = useScanDelayReviewAlertStore.getState();
    useScanDelayReviewAlertStore.setState({
      banner: state.banner?.requestId === bizId ? null : state.banner,
      island: state.island?.requestId === bizId ? null : state.island,
    });
  };
  window.addEventListener(NOTIFICATION_READ_CHANGED_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATION_READ_CHANGED_EVENT, handler);
}
