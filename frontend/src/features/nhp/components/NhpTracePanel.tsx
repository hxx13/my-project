import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import { parseToDate } from "@/utils/beijingTime";
import type { NhpAuditEntry } from "../api/nhpRecord.api";
import NhpUserRefLabel from "./NhpUserRefLabel";

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

const STAGE_REASON_KEYS = ["快照", "完成", "锁定", "回退", "质疑", "质疑关闭", "query回复", "复核"];

type DayGroup = {
  dateKey: string;
  label: string;
  stageItems: NhpAuditEntry[];
  fieldItems: NhpAuditEntry[];
};

function isStageEntry(t: NhpAuditEntry): boolean {
  const reason = t.changeReason || "";
  return !t.fieldId || t.fieldId === 0 || STAGE_REASON_KEYS.some((k) => reason.includes(k));
}

function dayKeyFromAudit(t: NhpAuditEntry): string {
  const d = parseToDate(t.createdAt == null ? null : String(t.createdAt));
  if (!d) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(dateKey: string): string {
  if (dateKey === "unknown") return "未知日期";
  const today = dayKeyFromAudit({ createdAt: new Date().toISOString() } as NhpAuditEntry);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = dayKeyFromAudit({ createdAt: yesterday.toISOString() } as NhpAuditEntry);
  if (dateKey === today) return "今天";
  if (dateKey === yKey) return "昨天";
  const [y, m, d] = dateKey.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function groupAuditsByDay(audits: NhpAuditEntry[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const t of audits) {
    const key = dayKeyFromAudit(t);
    let g = map.get(key);
    if (!g) {
      g = { dateKey: key, label: dayLabel(key), stageItems: [], fieldItems: [] };
      map.set(key, g);
    }
    if (isStageEntry(t)) g.stageItems.push(t);
    else g.fieldItems.push(t);
  }
  return [...map.values()];
}

function SidebarSection({
  title,
  count,
  open,
  onToggle,
  children,
  accent,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  accent?: "warn" | "default";
}) {
  return (
    <section className={"nhp-sidebar-section" + (open ? " is-open" : "") + (accent === "warn" ? " accent-warn" : "")}>
      <button type="button" className="nhp-sidebar-section-hd" onClick={onToggle} aria-expanded={open}>
        <span className="nhp-sidebar-section-title">{title}</span>
        {count != null && count > 0 ? <span className="nhp-sidebar-section-count">{count}</span> : null}
        <span className="nhp-sidebar-section-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? <div className="nhp-sidebar-section-body">{children}</div> : null}
    </section>
  );
}

function AuditTraceItem({ t }: { t: NhpAuditEntry }) {
  const reason = t.changeReason || "";
  const isStage = isStageEntry(t);
  const label = REASON_LABELS[reason] ?? reason ?? t.changeType;
  const fieldLabel = t.fieldName || t.fieldCode;
  return (
    <div className={"trace " + (isStage ? "stage" : "edit")}>
      <div className="t">
        {label}
        {fieldLabel ? ` · ${fieldLabel}` : ""}
        {!isStage && t.afterValue != null ? ` → ${truncate(String(t.afterValue), 36)}` : ""}
      </div>
      <div className="m">{formatDateTimeAsiaShanghaiShort(t.createdAt)}</div>
      {t.operatorId && (
        <div className="who">
          <NhpUserRefLabel name={t.operatorName} userId={t.operatorId} prefix="操作人" />
        </div>
      )}
    </div>
  );
}

/** 右侧留痕面板：按日折叠审计 + 质疑区段（对齐 AUP TracePanel / 医疗紧凑侧栏）。 */
export default function NhpTracePanel({
  audits,
  snapshotCount = 0,
  onOpenSnapshots,
  openQueryCount = 0,
  children,
}: {
  audits: NhpAuditEntry[];
  snapshotCount?: number;
  onOpenSnapshots?: () => void;
  /** 开放质疑数，用于默认展开质疑区 */
  openQueryCount?: number;
  children?: ReactNode;
}) {
  const dayGroups = useMemo(() => groupAuditsByDay(audits), [audits]);
  const [traceOpen, setTraceOpen] = useState(true);
  const [queryOpen, setQueryOpen] = useState(openQueryCount > 0);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());
  const [expandedFieldBatches, setExpandedFieldBatches] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (dayGroups.length === 0) return;
    setExpandedDays((prev) => {
      if (prev.size > 0) return prev;
      return new Set([dayGroups[0].dateKey]);
    });
  }, [dayGroups]);

  useEffect(() => {
    if (openQueryCount > 0) setQueryOpen(true);
  }, [openQueryCount]);

  const toggleDay = (key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleFieldBatch = (key: string) => {
    setExpandedFieldBatches((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const fieldBatchDefaultCollapsed = (n: number) => n > 4;

  return (
    <aside className="trace-panel nhp-fill-sidebar">
      <div className="hd nhp-fill-sidebar-hd">
        <span>留痕 · 质疑</span>
        {onOpenSnapshots && (
          <button type="button" className="btn ghost small" onClick={onOpenSnapshots}>
            快照{snapshotCount > 0 ? `(${snapshotCount})` : ""}
          </button>
        )}
      </div>
      <div className="body nhp-fill-sidebar-body">
        <SidebarSection
          title="提交记录"
          count={audits.length}
          open={traceOpen}
          onToggle={() => setTraceOpen((v) => !v)}
        >
          {!audits || audits.length === 0 ? (
            <div className="nhp-sidebar-empty">
              暂无记录
              <div className="nhp-sidebar-empty-sub">保存字段后，变更会写入审计日志（ALCOA+）</div>
            </div>
          ) : (
            <div className="nhp-trace-groups">
              {dayGroups.map((g) => {
                const dayOpen = expandedDays.has(g.dateKey);
                const total = g.stageItems.length + g.fieldItems.length;
                const fieldKey = `${g.dateKey}-fields`;
                const fieldOpen = expandedFieldBatches.has(fieldKey);
                const fieldCollapsedByDefault = fieldBatchDefaultCollapsed(g.fieldItems.length);
                const showFieldItems = g.fieldItems.length === 0 ? null : fieldCollapsedByDefault ? fieldOpen : true;

                return (
                  <div key={g.dateKey} className={"nhp-trace-day" + (dayOpen ? " is-open" : "")}>
                    <button
                      type="button"
                      className="nhp-trace-day-hd"
                      onClick={() => toggleDay(g.dateKey)}
                      aria-expanded={dayOpen}
                    >
                      <span>{g.label}</span>
                      <span className="nhp-trace-day-meta">{total} 条</span>
                      <span className="nhp-sidebar-section-chevron" aria-hidden>
                        {dayOpen ? "▾" : "▸"}
                      </span>
                    </button>
                    {dayOpen ? (
                      <div className="nhp-trace-day-body">
                        {g.stageItems.map((t) => (
                          <AuditTraceItem key={t.id} t={t} />
                        ))}
                        {g.fieldItems.length > 0 && (
                          <div className={"nhp-trace-field-batch" + (showFieldItems ? " is-open" : "")}>
                            {fieldCollapsedByDefault ? (
                              <button
                                type="button"
                                className="nhp-trace-field-batch-hd"
                                onClick={() => toggleFieldBatch(fieldKey)}
                                aria-expanded={!!showFieldItems}
                              >
                                <span>字段变更</span>
                                <span className="nhp-trace-day-meta">{g.fieldItems.length} 条</span>
                                <span className="nhp-sidebar-section-chevron" aria-hidden>
                                  {showFieldItems ? "▾" : "▸"}
                                </span>
                              </button>
                            ) : (
                              <div className="nhp-trace-field-batch-label">字段变更 · {g.fieldItems.length}</div>
                            )}
                            {showFieldItems ? (
                              <div className="nhp-trace-field-batch-body">
                                {g.fieldItems.map((t) => (
                                  <AuditTraceItem key={t.id} t={t} />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </SidebarSection>

        {children ? (
          <SidebarSection
            title="数据质疑"
            count={openQueryCount > 0 ? openQueryCount : undefined}
            open={queryOpen}
            onToggle={() => setQueryOpen((v) => !v)}
            accent={openQueryCount > 0 ? "warn" : "default"}
          >
            {children}
          </SidebarSection>
        ) : null}
      </div>
    </aside>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
