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
