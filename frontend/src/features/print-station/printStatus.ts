/**
 * 打印任务状态的中文展示。**两个页面共用这一份** —— 工位页和后台队列页
 * 各写一份的话，迟早会出现同一状态两种叫法。
 */
import type { PrintJobStatus } from "@/api/domains/print.api";

export interface PrintStatusMeta {
  label: string;
  /** 交给 .review-status 的 data-tone */
  tone: string;
  /** 悬停说明。状态名本身没法承载这些细节，但现场的人需要知道 */
  hint: string;
}

export const PRINT_STATUS_META: Record<PrintJobStatus, PrintStatusMeta> = {
  PENDING: { label: "排队中", tone: "info", hint: "在队列里等着，还没被打印机领走。可以撤回。" },
  SENT: { label: "打印中", tone: "pending", hint: "已被打印机领走，正在提交给系统打印队列。" },
  PRINTED: {
    label: "已打印",
    tone: "ok",
    // 这条提醒很重要：状态只代表「已交给系统打印队列」，
    // 卡纸、缺粉、打印机暂停，这里都看不出来。本项目已经因此误判过好几次。
    hint: "已提交到系统打印队列。**不代表纸张已出** —— 卡纸、缺粉、打印机暂停这里都看不出来。",
  },
  FAILED: { label: "失败", tone: "bad", hint: "打印没成功，原因见「说明」列。可以重新排队。" },
  CANCELLED: { label: "已撤回", tone: "none", hint: "排队期间被撤回，不会再打。" },
};

/** 认不出的状态原样返回，别吞掉信息。 */
export function printStatusOf(status: string): PrintStatusMeta {
  return PRINT_STATUS_META[status as PrintJobStatus] ?? { label: status, tone: "none", hint: "" };
}

/**
 * 「已打印」旁边那一句：这条现在还卡在打印机队列里吗？
 *
 * 单独一维，不塞进 PRINT_STATUS_META —— 那张表是按 status 查的，塞进去就变成两维。
 * 没核对过（null / 老数据没这个字段）时不说任何话：不知道就闭嘴，
 * 别替打印机下"打完了"的结论，也别吓唬人。
 */
export function queueHintOf(queueState: string | null | undefined): string {
  return queueState === "QUEUED" ? "还排在打印机队列里，纸一直没出来。" : "";
}
