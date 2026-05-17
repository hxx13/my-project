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
      <div className={`rounded-xl border border-white/10 bg-black/30 ${compact ? "p-2" : "p-3"} text-[10px] text-slate-400`}>
        正在查询发卡状态…
      </div>
    );
  }

  if (!mapping?.bound) {
    return (
      <div className={`rounded-xl border border-amber-500/30 bg-amber-500/10 ${compact ? "p-2" : "p-3"}`}>
        <p className="text-[11px] font-bold text-amber-200">当前未绑卡</p>
        <p className="text-[10px] text-amber-200/80 mt-0.5">绑卡后可使用自带校园卡进入门禁。</p>
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
    <div className={`rounded-xl border border-white/10 bg-black/40 ${compact ? "p-2 space-y-1" : "p-3 space-y-2"}`}>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">发卡当前状态</p>
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
            cardStatus === "FROZEN"
              ? "bg-red-500/20 text-red-200 border border-red-500/40"
              : "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40"
          }`}
        >
          卡片：{cardStatus === "FROZEN" ? "冻结" : "正常"}
        </span>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
            exempt
              ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
              : "bg-slate-500/20 text-slate-300 border border-slate-500/40"
          }`}
        >
          风控：{exempt ? "豁免" : "受控"}
          {exemptRemain ? ` · ${exemptRemain}` : ""}
        </span>
      </div>
      <p className="font-mono text-[10px] text-slate-400 break-all">
        物理卡号：{mapping.cardNo || "—"}
        {mapping.dahuaSeq ? ` · 序号 ${mapping.dahuaSeq}` : ""}
      </p>
    </div>
  );
}
