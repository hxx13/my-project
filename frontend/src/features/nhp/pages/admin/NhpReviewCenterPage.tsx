/**
 * NHP 审核中心（待我处理的任务队列，按身份加载，对齐 24 §2 / 27 §7）。
 *
 * 四 tab：字段校对 / 记录复核 / 签署 / 待确认，按 role/dag 过滤（心脏PI 看 D9、肝脏PI 看 D10、兽医看照护）。
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { TASK_TAB_OPTIONS, fetchNhpMyTasks } from "../../api/nhpTask.api";
import "@/features/aup/aup.css";
import "../../nhp.css";
import { PortalHeader } from "@/features/portal/PortalHeader";

export default function NhpReviewCenterPage() {
  const goBack = useGoBack("/nhp/overview");
  const [tab, setTab] = useState<string>("FIELD_REVIEW");

  const tasksQuery = useQuery({ queryKey: ["nhp", "my-tasks"], queryFn: fetchNhpMyTasks });
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);

  const tabs = useMemo(() => {
    return TASK_TAB_OPTIONS.map((t) => ({ ...t, count: tasks.filter((x) => x.tab === t.value).length }));
  }, [tasks]);

  const filtered = useMemo(() => tasks.filter((t) => t.tab === tab), [tasks, tab]);

  return (
    <>
      <PortalHeader onOpenLogin={() => {}} />
      <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>审核中心</h1>
            <div className="sub">待我处理的任务队列 · 按身份加载（角色 × 数据域）</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)" }}>
            {tabs.map((t) => (
              <button
                key={t.value}
                type="button"
                style={{
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: tab === t.value ? "var(--primary)" : "var(--muted)",
                  borderBottom: tab === t.value ? "2px solid var(--primary)" : "2px solid transparent",
                  background: "none",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onClick={() => setTab(t.value)}
              >
                {t.label}
                <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: tab === t.value ? "var(--primary-weak)" : "#EEF2F7", color: tab === t.value ? "var(--primary)" : "var(--slate)" }}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div className="aup-wb-panel">
            <div className="aup-wb-table-wrap">
              <table className="aup-wb-table">
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>标识</th>
                    <th>内容</th>
                    <th style={{ width: 100 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasksQuery.isError ? (
                    <tr><td colSpan={3} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</td></tr>
                  ) : tasksQuery.isLoading ? (
                    <tr><td colSpan={3} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载任务…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>暂无待处理任务</td></tr>
                  ) : (
                    filtered.map((t) => (
                      <tr key={t.id}>
                        <td className="mono">{t.code}</td>
                        <td>{t.title}{t.sub ? <span style={{ color: "var(--muted)", display: "block", fontSize: 11 }}>{t.sub}</span> : null}</td>
                        <td><span style={{ color: "var(--primary)", fontWeight: 600, fontSize: 12 }}>{t.action}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
