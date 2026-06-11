import type { ScanCardMappingStatus } from "@/api/domains/scanner.api";
import { formatExemptRemaining } from "@/constants/exemptDurationPresets";

function normalizeCardStatus(raw?: string): "FROZEN" | "NORMAL" {
  return String(raw || "").toUpperCase() === "FROZEN" ? "FROZEN" : "NORMAL";
}

/** 与大华发卡库列表一致的状态芯片（卡片 / 风控） */
export function DahuaCardMappingStatusPanel({
  mapping,
  loading,
  compact = false,
}: {
  mapping: ScanCardMappingStatus | null;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading) {
    return (
      <div className={`rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] ${compact ? "p-2" : "p-3"} text-[10px] text-[var(--app-color-text-tertiary)]`}>
        正在查询发卡状态…
      </div>
    );
  }

  if (!mapping?.bound) {
    return (
      <div className={`rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-warning)]/30 bg-[var(--app-color-feedback-warning-soft)] ${compact ? "p-2" : "p-3"}`}>
        <p className="text-[11px] font-bold text-[var(--app-color-feedback-warning)]">当前未绑卡</p>
        <p className="mt-0.5 text-[10px] text-[var(--app-color-text-secondary)]">绑卡后可使用自带校园卡进入门禁。</p>
      </div>
    );
  }

  const cardStatus = normalizeCardStatus(mapping.cardStatus);
  const exempt =
    Number(mapping.freezeExemptFlag ?? 0) === 1 &&
    (!mapping.freezeExemptExpireAt ||
      Date.parse(String(mapping.freezeExemptExpireAt).replace(/-/g, "/")) > Date.now());
  const exemptRemain = exempt ? formatExemptRemaining(mapping.freezeExemptExpireAt) : "";

  return (
    <div className={`rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] ${compact ? "space-y-1 p-2" : "space-y-2 p-3"}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--app-color-text-tertiary)]">发卡当前状态</p>
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${
            cardStatus === "FROZEN"
              ? "border-[var(--app-color-feedback-danger)]/40 bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]"
              : "border-[var(--app-color-feedback-success)]/40 bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]"
          }`}
        >
          卡片：{cardStatus === "FROZEN" ? "冻结" : "正常"}
        </span>
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${
            exempt
              ? "border-[var(--app-color-feedback-warning)]/40 bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]"
              : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)]"
          }`}
        >
          风控：{exempt ? "豁免" : "受控"}
          {exemptRemain ? ` · ${exemptRemain}` : ""}
        </span>
      </div>
      <p className="break-all font-mono text-[10px] text-[var(--app-color-text-tertiary)]">
        物理卡号：{mapping.cardNo || "—"}
        {mapping.dahuaSeq ? ` · 序号 ${mapping.dahuaSeq}` : ""}
      </p>
    </div>
  );
}
