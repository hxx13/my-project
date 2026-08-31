/**
 * NHP 数据质量中心（单页，对齐 22 §6.5 / 25 §A）。
 *
 * 质控月报五 KPI + 四类质量事件收口队列（异常值 / 时点偏差 / TAT / CoC 断裂）。
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  QUALITY_EVENT_TYPE_OPTIONS,
  fetchNhpQualityEvents,
  fetchNhpQualityReport,
  qualityEventStatusLabel,
  qualityEventTypeLabel,
} from "../../api/nhpQuality.api";
import NhpUserRefLabel from "../../components/NhpUserRefLabel";
import "@/features/aup/aup.css";
import "../../nhp.css";

function KpiCard({ value, label, tone }: { value: string | number; label: string; tone?: "ok" | "warn" | "danger" }) {
  const color = tone === "ok" ? "var(--success)" : tone === "warn" ? "var(--warn)" : tone === "danger" ? "var(--danger)" : "var(--text)";
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function eventTypeTone(v: string): "danger" | "warn" | "ok" | undefined {
  if (v === "OUTLIER" || v === "COC_BROKEN") return "danger";
  if (v === "DEVIATION") return "warn";
  return undefined;
}

export default function NhpQualityPage() {
  const goBack = useGoBack("/nhp-admin/template");
  const [typeFilter, setTypeFilter] = useState("");

  const eventsQuery = useQuery({ queryKey: ["nhp", "quality-events"], queryFn: fetchNhpQualityEvents });
  const reportQuery = useQuery({ queryKey: ["nhp", "quality-report"], queryFn: fetchNhpQualityReport });

  const events = useMemo(() => {
    const list = eventsQuery.data ?? [];
    return typeFilter ? list.filter((e) => e.eventType === typeFilter) : list;
  }, [eventsQuery.data, typeFilter]);

  const report = reportQuery.data;

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>数据质量中心</h1>
            <div className="sub">双人复核 / 异常值复测 / TAT / 时点偏差 / CoC 断裂 → 统一收口队列</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* 五 KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            <KpiCard value={report?.doubleEntryRate != null ? `${report.doubleEntryRate}%` : "—"} label="双人复核完成率" tone="ok" />
            <KpiCard value={report?.outlierClosedRate != null ? `${report.outlierClosedRate}%` : "—"} label="异常值复测闭环" />
            <KpiCard value={report?.tatOnTimeRate != null ? `${report.tatOnTimeRate}%` : "—"} label="TAT 达标率" />
            <KpiCard value={report?.deviationRate != null ? `${report.deviationRate}%` : "—"} label="时点偏差率" tone="warn" />
            <KpiCard value={report?.cocOpenCount ?? "—"} label="CoC 断裂（未闭环）" tone="danger" />
          </div>

          {/* 事件队列 */}
          <div className="aup-wb-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">数据质量事件队列</span>
              <span className="aup-wb-chip muted">{events.length} 条</span>
              <span style={{ flex: 1 }} />
              <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <button
                  type="button"
                  className="btn small ghost"
                  style={{ borderRadius: 0, background: typeFilter === "" ? "var(--primary-weak)" : undefined }}
                  onClick={() => setTypeFilter("")}
                >
                  全部
                </button>
                {QUALITY_EVENT_TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    className="btn small ghost"
                    style={{ borderRadius: 0, background: typeFilter === o.value ? "var(--primary-weak)" : undefined }}
                    onClick={() => setTypeFilter(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
              <table className="aup-wb-table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>类型</th>
                    <th>对象</th>
                    <th>触发规则</th>
                    <th style={{ width: 100 }}>状态</th>
                    <th style={{ width: 100 }}>复核人</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsQuery.isError ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</td>
                    </tr>
                  ) : eventsQuery.isLoading ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载事件…</td>
                    </tr>
                  ) : events.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>暂无质量事件</td>
                    </tr>
                  ) : (
                    events.map((e) => {
                      const tone = eventTypeTone(e.eventType);
                      const typeColor = tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--text)";
                      return (
                        <tr key={e.id}>
                          <td>
                            <span style={{ fontSize: 12, fontWeight: 700, color: typeColor }}>{qualityEventTypeLabel(e.eventType)}</span>
                          </td>
                          <td className="mono">{e.refType}#{e.refId}</td>
                          <td style={{ color: "var(--muted)" }}>{e.triggerRule}</td>
                          <td>
                            <span className="aup-wb-chip muted">{qualityEventStatusLabel(e.status)}</span>
                          </td>
                          <td style={{ color: "var(--muted)" }}>
                            <NhpUserRefLabel name={e.reviewerName} userId={e.reviewer} inline />
                            {!e.reviewerName && !e.reviewer ? "—" : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
