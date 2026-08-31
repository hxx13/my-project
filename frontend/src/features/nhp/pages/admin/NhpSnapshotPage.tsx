/**
 * NHP 快照页（单页，对齐 24 §3.8）。
 *
 * crf_record_snapshot：快照列表 + 字段级对比（回滚落审计，前端仅展示对比，回滚动作待后端就绪）。
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { fetchNhpSnapshotDiff, fetchNhpSnapshots, type NhpSnapshot } from "../../api/nhpSnapshot.api";
import NhpUserRefLabel from "../../components/NhpUserRefLabel";
import "@/features/aup/aup.css";
import "../../nhp.css";

function stageTone(stage: string): string {
  switch (stage.toUpperCase()) {
    case "LOCKED":
      return "var(--slate)";
    case "COMPLETE":
      return "var(--success)";
    default:
      return "var(--primary)";
  }
}

export default function NhpSnapshotPage() {
  const goBack = useGoBack("/nhp-admin/template");
  const [diffFor, setDiffFor] = useState<{ id: number; otherId: number } | null>(null);

  const snapshotsQuery = useQuery({ queryKey: ["nhp", "snapshots"], queryFn: () => fetchNhpSnapshots() });
  const snapshots = useMemo(
    () => [...(snapshotsQuery.data ?? [])].sort((a, b) => (b.recordId ?? 0) - (a.recordId ?? 0) || b.version - a.version),
    [snapshotsQuery.data],
  );

  const diffQuery = useQuery({
    queryKey: ["nhp", "snapshot-diff", diffFor?.id, diffFor?.otherId],
    queryFn: () => fetchNhpSnapshotDiff(diffFor!.id, diffFor!.otherId),
    enabled: !!diffFor,
  });

  /** 找同记录的上一个版本 */
  const prevOf = (s: NhpSnapshot): NhpSnapshot | null => {
    const sameRecord = snapshots.filter((x) => x.recordId === s.recordId && x.version < s.version);
    return sameRecord.sort((a, b) => b.version - a.version)[0] ?? null;
  };

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>快照</h1>
            <div className="sub">crf_record_snapshot · 列表 / 字段级对比（回滚动作待后端就绪）</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="aup-wb-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">快照列表</span>
              <span className="aup-wb-chip muted">{snapshots.length} 份</span>
            </div>
            <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
              <table className="aup-wb-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>记录 #</th>
                    <th style={{ width: 70 }}>版本</th>
                    <th style={{ width: 100 }}>stage</th>
                    <th style={{ width: 110 }}>业务阶段</th>
                    <th style={{ width: 100 }}>创建人</th>
                    <th style={{ width: 120 }}>时间</th>
                    <th style={{ width: 100 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotsQuery.isError ? (
                    <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</td></tr>
                  ) : snapshotsQuery.isLoading ? (
                    <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载快照…</td></tr>
                  ) : snapshots.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>暂无快照</td></tr>
                  ) : (
                    snapshots.map((s) => {
                      const prev = prevOf(s);
                      return (
                        <tr key={s.id}>
                          <td className="mono">#{s.recordId}</td>
                          <td>v{s.version}</td>
                          <td><span style={{ fontSize: 12, fontWeight: 700, color: stageTone(s.stage) }}>{s.stage}</span></td>
                          <td style={{ color: "var(--muted)" }}>{s.bizStage ?? "—"}</td>
                          <td style={{ color: "var(--muted)" }}>
                            <NhpUserRefLabel name={s.createdByName} userId={s.createdBy} inline />
                            {!s.createdByName && !s.createdBy ? "—" : null}
                          </td>
                          <td style={{ color: "var(--muted)" }}>{s.createdAt ?? "—"}</td>
                          <td>
                            {prev ? (
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={() => setDiffFor({ id: s.id, otherId: prev.id })}
                              >
                                对比 v{prev.version}
                              </button>
                            ) : (
                              <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {diffFor && (
            <div className="aup-wb-panel">
              <div className="aup-wb-panel-hd">
                <span className="title">对比 v{diffFor.otherId} → v{diffFor.id}</span>
                <span style={{ flex: 1 }} />
                <button type="button" className="btn small ghost" onClick={() => setDiffFor(null)}>关闭</button>
              </div>
              <div style={{ padding: "8px 16px 16px" }}>
                {diffQuery.isLoading ? (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "16px 0" }}>加载对比…</div>
                ) : diffQuery.isError ? (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "16px 0" }}>加载失败</div>
                ) : (diffQuery.data ?? []).length === 0 ? (
                  <div style={{ color: "var(--muted)", fontSize: 13, padding: "16px 0" }}>无字段变更</div>
                ) : (
                  (diffQuery.data ?? []).map((d) => (
                    <div key={d.fieldCode} style={{ display: "flex", gap: 10, padding: "6px 10px", borderRadius: 6, fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{d.fieldCode}</span>
                      <span style={{ color: "var(--muted)" }}>{d.beforeValue ?? "—"}</span>
                      <span style={{ color: "var(--muted)" }}>→</span>
                      <span style={{ color: "var(--primary)", fontWeight: 700 }}>{d.afterValue ?? "—"}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
