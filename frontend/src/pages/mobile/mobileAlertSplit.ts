import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";

export const FEEDBACK_KINDS = new Set<MobileAlertItem["kind"]>([
  "material_feedback",
  "scan_delay_feedback",
]);

export function isFeedbackKind(kind?: string): boolean {
  return FEEDBACK_KINDS.has(kind as MobileAlertItem["kind"]);
}

export function splitMobileAlerts(items: MobileAlertItem[]) {
  const announcements: MobileAlertItem[] = [];
  const feedbacks: MobileAlertItem[] = [];
  for (const item of items) {
    if (isFeedbackKind(item.kind)) {
      feedbacks.push(item);
    } else {
      announcements.push(item);
    }
  }
  return { announcements, feedbacks };
}
