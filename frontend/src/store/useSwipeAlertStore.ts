import { create } from "zustand";

export interface SwipeAlertPayload {
  alertId: string;
  ruleId: number;
  ruleName: string;
  title: string;
  body: string;
  count: number;
  windowSec: number;
  bannerDurationSec: number;
  matchedRecords: SwipeAlertRecordBrief[];
}

export interface SwipeAlertRecordBrief {
  personName: string;
  personCode: string;
  departmentName: string;
  channelName: string;
  channelCode: string;
  openTypeLabel: string;
  swingTime: string;
  enterOrExit: number | null;       // 1=进入, 2=离开 (hardware)
  enterOrExitLabel: string;
  mobilePhone: string;              // from aro_personnel lookup
  aroUserId: string;                // ARO user_id
  aroStatus: string;                // INSIDE | OUTSIDE | UNKNOWN
}

const MAX_ALERTS = 5;

interface SwipeAlertState {
  /** Active alerts ordered newest-first (alerts[0] = top of stack) */
  alerts: SwipeAlertPayload[];
  /** Alert IDs currently in their leave animation (local or remote dismiss) */
  dismissingIds: Set<string>;
  /** Push a new alert to the top of the stack. Dedup by alertId, cap at MAX_ALERTS. */
  showAlert: (alert: SwipeAlertPayload) => void;
  /** Phase 1: mark alert as leaving (triggers leave animation in the UI). */
  startDismiss: (alertId: string) => void;
  /** Phase 2: remove alert from the array AND the dismissing set. */
  finishDismiss: (alertId: string) => void;
}

export const useSwipeAlertStore = create<SwipeAlertState>((set) => ({
  alerts: [],
  dismissingIds: new Set<string>(),

  showAlert: (alert) =>
    set((state) => {
      // Dedup: skip if this alertId is already in the queue
      if (state.alerts.some((a) => a.alertId === alert.alertId)) {
        return state;
      }
      // Prepend new alert (newest on top), cap at MAX_ALERTS
      const next = [alert, ...state.alerts].slice(0, MAX_ALERTS);
      return { alerts: next };
    }),

  startDismiss: (alertId) =>
    set((state) => {
      if (state.dismissingIds.has(alertId)) return state; // already leaving
      const next = new Set(state.dismissingIds);
      next.add(alertId);
      return { dismissingIds: next };
    }),

  finishDismiss: (alertId) =>
    set((state) => {
      const nextDismissing = new Set(state.dismissingIds);
      nextDismissing.delete(alertId);
      return {
        alerts: state.alerts.filter((a) => a.alertId !== alertId),
        dismissingIds: nextDismissing,
      };
    }),
}));
