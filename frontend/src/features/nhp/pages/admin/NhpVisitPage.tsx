/**
 * NHP 访视时点配置页（单页，对齐 22 §2.1 / 24 §3.4）。
 *
 * - crf_visit：TP01~TP12 行编辑（event_anchor / frequency / planned_days / early·late 窗口 / end_days）
 * - crf_timepoint_map：65 原始 timepoint → (event_anchor × frequency × tp_code) 归一化映射（只读）
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  EVENT_ANCHOR_OPTIONS,
  FREQUENCY_OPTIONS,
  fetchNhpVisits,
  updateNhpVisit,
  type NhpVisit,
} from "../../api/nhpVisit.api";
import "@/features/aup/aup.css";
import "../../nhp.css";

/** 数字单元格：本地草稿 + 失焦提交，避免每击键一次请求 */
function NumCell({ value, onCommit }: { value?: number | null; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  return (
    <input
      className="input"
      type="number"
      style={{ width: 92 }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        onCommit(t === "" ? null : Number(t));
      }}
    />
  );
}

export default function NhpVisitPage() {
  const qc = useQueryClient();
  const goBack = useGoBack("/content-manager/nhp-template");

  const visitsQuery = useQuery({ queryKey: ["nhp", "visits"], queryFn: fetchNhpVisits });

  const visits = useMemo(
    () =>
      [...(visitsQuery.data ?? [])].sort(
        (a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.code.localeCompare(b.code),
      ),
    [visitsQuery.data],
  );

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<NhpVisit> }) => updateNhpVisit(id, patch),
    onSuccess: () => {
      toast.success("已保存");
      void qc.invalidateQueries({ queryKey: ["nhp", "visits"] });
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const patch = (row: NhpVisit, p: Partial<NhpVisit>) => updateMut.mutate({ id: row.id, patch: p });

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>访视 / 时点</h1>
            <div className="sub">
              TP01~TP12 访视时点定义 + event_anchor / 窗口天数
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* TP 列表（行编辑） */}
          <div className="aup-wb-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">访视时点（crf_visit）</span>
              <span className="aup-wb-chip muted">共 {visits.length} 个时点</span>
            </div>
            <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
              <table className="aup-wb-table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>TP 码</th>
                    <th style={{ width: 130 }}>时点名</th>
                    <th style={{ width: 160 }}>event_anchor</th>
                    <th style={{ width: 100 }}>planned_days</th>
                    <th style={{ width: 92 }}>early_days</th>
                    <th style={{ width: 92 }}>late_days</th>
                    <th style={{ width: 92 }}>end_days</th>
                  </tr>
                </thead>
                <tbody>
                  {visitsQuery.isError ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>
                        加载失败，请刷新重试
                      </td>
                    </tr>
                  ) : visitsQuery.isLoading ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>
                        加载访视时点…
                      </td>
                    </tr>
                  ) : visits.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>
                        暂无访视时点
                      </td>
                    </tr>
                  ) : (
                    visits.map((v) => (
                      <tr key={v.id}>
                        <td className="mono">{v.code}</td>
                        <td>{v.name}</td>
                        <td>
                          <select
                            className="select"
                            value={v.eventAnchor ?? ""}
                            onChange={(e) => patch(v, { eventAnchor: e.target.value || null })}
                          >
                            <option value="">—</option>
                            {EVENT_ANCHOR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <NumCell value={v.plannedDays} onCommit={(n) => patch(v, { plannedDays: n })} />
                        </td>
                        <td>
                          <NumCell value={v.earlyDays} onCommit={(n) => patch(v, { earlyDays: n })} />
                        </td>
                        <td>
                          <NumCell value={v.lateDays} onCommit={(n) => patch(v, { lateDays: n })} />
                        </td>
                        <td>
                          <NumCell value={v.endDays} onCommit={(n) => patch(v, { endDays: n })} />
                        </td>
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
  );
}
