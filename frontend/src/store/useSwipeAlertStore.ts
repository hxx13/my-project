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
  openTypeLabel: string;
  swingTime: string;
}

interface SwipeAlertState {
  activeAlert: SwipeAlertPayload | null;
  showAlert: (alert: SwipeAlertPayload) => void;
  dismissAlert: () => void;
}

export const useSwipeAlertStore = create<SwipeAlertState>((set) => ({
  activeAlert: null,
  showAlert: (alert) => set({ activeAlert: alert }),
  dismissAlert: () => set({ activeAlert: null }),
}));
