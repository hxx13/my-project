import type { ReactNode } from "react";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import type { NhpAuditEntry } from "../api/nhpRecord.api";

const REASON_LABELS: Record<string, string> = {
  录入: "字段录入",
  修正: "字段修正",
  快照: "创建快照",
  完成: "提交完成",
  锁定: "数据锁定",
  二录: "双录入二录",
  质疑: "发起质疑",
  质疑关闭: "关闭质疑",
  query回复: "质疑回复",
  导入: "数据导入",
  复核: "复核",
};

/** 右侧留痕面板（对齐 AUP TracePanel / `.trace-panel`）。 */
export default function NhpTracePanel({
  audits,
  snapshotCount = 0,
  onOpenSnapshots,
  children,
}: {
  audits: NhpAuditEntry[];
  snapshotCount?: number;
  onOpenSnapshots?: () => void;
  children?: ReactNode;
}) {
  return (
    <aside className="trace-panel">
      <div className="hd" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span>进行记录 · 留痕</span>
        {onOpenSnapshots && (
          <button type="button" className="btn ghost small" onClick={onOpenSnapshots}>
            快照{snapshotCount > 0 ? `(${snapshotCount})` : ""}
          </button>
        )}
      </div>
      <div className="body">
        {!audits || audits.length === 0 ? (
          <div className="aup-empty" style={{ padding: "20px 0" }}>
            暂无记录
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, fontWeight: 400 }}>
              保存字段后，变更会写入审计日志（ALCOA+）
            </div>
          </div>
        ) : (
          audits.map((t) => {
            const reason = t.changeReason || "";
            const isStage =
              !t.fieldId ||
              t.fieldId === 0 ||
              ["快照", "完成", "锁定", "回退", "质疑", "质疑关闭"].some((k) => reason.includes(k));
            const label = REASON_LABELS[reason] ?? reason ?? t.changeType;
            const fieldLabel = t.fieldName || t.fieldCode;
            return (
              <div key={t.id} className={"trace " + (isStage ? "stage" : "edit")}>
                <div className="t">
                  {label}
                  {fieldLabel ? ` · ${fieldLabel}` : ""}
                  {!isStage && t.afterValue != null ? ` → ${truncate(String(t.afterValue), 40)}` : ""}
                </div>
                <div className="m">{formatDateTimeAsiaShanghaiShort(t.createdAt)}</div>
                {t.operatorId && (
                  <div className="who">
                    操作人：<b>{(t.operatorName && t.operatorName.trim()) || t.operatorId}</b>
                  </div>
                )}
              </div>
            );
          })
        )}
        {children}
      </div>
    </aside>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
