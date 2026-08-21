import type { ScanPopupAnnouncementRow } from "@/api/domains/scanPopupAnnouncement.api";

export type TimeStatus = "pending" | "active" | "expired" | "indefinite";

export function getTimeStatus(row: ScanPopupAnnouncementRow): TimeStatus {
  const now = Date.now();
  const publish = row.publishAt ? new Date(row.publishAt).getTime() : null;
  const expire = row.expireAt ? new Date(row.expireAt).getTime() : null;
  if (!publish && !expire) return "indefinite";
  if (publish && now < publish) return "pending";
  if (expire && now >= expire) return "expired";
  return "active";
}

export const TIME_STATUS_META: Record<TimeStatus, { label: string; color: string }> = {
  pending: {
    label: "待生效",
    color:
      "text-[var(--app-color-feedback-warning)] bg-[var(--app-color-feedback-warning-soft)] border-[var(--app-color-feedback-warning)]/30",
  },
  active: {
    label: "生效中",
    color:
      "text-[var(--app-color-feedback-success)] bg-[var(--app-color-feedback-success-soft)] border-[var(--app-color-feedback-success)]/30",
  },
  expired: {
    label: "已过期",
    color:
      "text-[var(--app-color-text-tertiary)] bg-[var(--app-color-surface-hover)] border-[var(--app-color-border-default)]",
  },
  indefinite: {
    label: "永久有效",
    color: "text-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] border-[var(--app-color-accent)]/30",
  },
};
