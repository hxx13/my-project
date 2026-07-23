import { create } from "zustand";

export interface CageNoticeAlertPayload {
  alertId: string;
  violationId: number;
  targetUserId: string;
  title: string;
  body: string;
  createdAt: string;
}

const MAX_ALERTS = 5;

interface CageNoticeStore {
  alerts: CageNoticeAlertPayload[];
  dismissingIds: Set<string>;
  showAlert: (alert: CageNoticeAlertPayload) => void;
  startDismiss: (alertId: string) => void;
  finishDismiss: (alertId: string) => void;
}

export const useCageNoticeAlertStore = create<CageNoticeStore>((set) => ({
  alerts: [],
  dismissingIds: new Set(),

  showAlert: (alert) =>
    set((s) => {
      if (s.alerts.some((a) => a.alertId === alert.alertId)) return s;
      const next = [alert, ...s.alerts];
      if (next.length > MAX_ALERTS) next.length = MAX_ALERTS;
      return { alerts: next };
    }),

  startDismiss: (alertId) =>
    set((s) => {
      const next = new Set(s.dismissingIds);
      next.add(alertId);
      return { dismissingIds: next };
    }),

  finishDismiss: (alertId) =>
    set((s) => ({
      alerts: s.alerts.filter((a) => a.alertId !== alertId),
      dismissingIds: (() => { const n = new Set(s.dismissingIds); n.delete(alertId); return n; })(),
    })),
}));
