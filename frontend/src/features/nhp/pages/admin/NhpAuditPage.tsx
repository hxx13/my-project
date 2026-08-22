/**
 * NHP 审计留痕页（单页双 tab，对齐 06 §100 / 24 §3.9）。
 *
 * 数据变更审计（crf_data_audit_log，每笔值变更 before/after）+ 字典变更审计（crf_dict_change_log）。
 * 两者只追加、不覆盖，对应治理合规「全字段级留痕 ALCOA+」。
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { fetchNhpDataAuditLog, fetchNhpDictChangeLog } from "../../api/nhpAudit.api";
import "@/features/aup/aup.css";
import "../../nhp.css";

type Tab = "data" | "dict";

function changeTypeTone(t: string): { bg: string; color: string } {
  switch (t.toUpperCase()) {
    case "INSERT":
    case "CREATE":
      return { bg: "var(--primary-weak)", color: "var(--primary)" };
    case "UPDATE":
      return { bg: "var(--warn-weak)", color: "var(--warn)" };
    case "DELETE":
      return { bg: "var(--danger-weak)", color: "var(--danger)" };
    case "FREEZE":
    case "RETIRE":
      return { bg: "#EEF2F7", color: "var(--slate)" };
    default:
      return { bg: "#EEF2F7", color: "var(--slate)" };
  }
}

export default function NhpAuditPage() {
  const goBack = useGoBack("/content-manager/nhp-template");
  const [tab, setTab] = useState<Tab>("data");

  const dataQuery = useQuery({ queryKey: ["nhp", "data-audit-log"], queryFn: fetchNhpDataAuditLog });
  const dictQuery = useQuery({ queryKey: ["nhp", "dict-change-log"], queryFn: fetchNhpDictChangeLog });

  const dataRows = dataQuery.data ?? [];
  const dictRows = dictQuery.data ?? [];

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>审计留痕</h1>
            <div className="sub">数据变更审计 + 字典变更审计 · 只追加不覆盖 · ALCOA+</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
            <button
              type="button"
              className="btn small ghost"
              style={{ borderRadius: 0, background: tab === "data" ? "var(--primary-weak)" : undefined }}
              onClick={() => setTab("data")}
            >
              数据变更审计
            </button>
            <button
              type="button"
              className="btn small ghost"
              style={{ borderRadius: 0, background: tab === "dict" ? "var(--primary-weak)" : undefined }}
              onClick={() => setTab("dict")}
            >
              字典变更审计
            </button>
          </div>

          {tab === "data" ? (
            <div className="aup-wb-panel">
              <div className="aup-wb-panel-hd">
                <span className="title">数据变更审计（crf_data_audit_log）</span>
                <span className="aup-wb-chip muted">{dataRows.length} 条</span>
              </div>
              <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
                <table className="aup-wb-table">
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th style={{ width: 100 }}>变更类型</th>
                      <th>前值</th>
                      <th>后值</th>
                      <th style={{ width: 90 }}>操作人</th>
                      <th>原因</th>
                      <th style={{ width: 110 }}>时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataQuery.isError ? (
                      <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</td></tr>
                    ) : dataQuery.isLoading ? (
                      <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载审计…</td></tr>
                    ) : dataRows.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>暂无数据审计</td></tr>
                    ) : (
                      dataRows.map((r) => {
                        const tone = changeTypeTone(r.changeType);
                        return (
                          <tr key={r.id}>
                            <td className="mono">{r.fieldCode}</td>
                            <td>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: tone.bg, color: tone.color }}>
                                {r.changeType}
                              </span>
                            </td>
                            <td style={{ color: "var(--muted)" }}>{r.beforeValue ?? "—"}</td>
                            <td>{r.afterValue ?? "—"}</td>
                            <td style={{ color: "var(--muted)" }}>{r.operator ?? "—"}</td>
                            <td style={{ color: "var(--muted)" }}>{r.changeReason ?? "—"}</td>
                            <td style={{ color: "var(--muted)" }}>{r.createdAt ?? "—"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="aup-wb-panel">
              <div className="aup-wb-panel-hd">
                <span className="title">字典变更审计（crf_dict_change_log）</span>
                <span className="aup-wb-chip muted">{dictRows.length} 条</span>
              </div>
              <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
                <table className="aup-wb-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>实体</th>
                      <th style={{ width: 100 }}>变更类型</th>
                      <th>对象</th>
                      <th>前 JSON</th>
                      <th>后 JSON</th>
                      <th style={{ width: 90 }}>操作人</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dictQuery.isError ? (
                      <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</td></tr>
                    ) : dictQuery.isLoading ? (
                      <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载审计…</td></tr>
                    ) : dictRows.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>暂无字典审计</td></tr>
                    ) : (
                      dictRows.map((r) => {
                        const tone = changeTypeTone(r.changeType);
                        return (
                          <tr key={r.id}>
                            <td>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: "#F3EFFF", color: "#7C3AED" }}>
                                {r.entity}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: tone.bg, color: tone.color }}>
                                {r.changeType}
                              </span>
                            </td>
                            <td className="mono">#{r.entityId ?? "—"}</td>
                            <td style={{ color: "var(--muted)", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{r.beforeJson ?? "—"}</td>
                            <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{r.afterJson ?? "—"}</td>
                            <td style={{ color: "var(--muted)" }}>{r.operator ?? "—"}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
