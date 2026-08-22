/**
 * NHP 序列网格（SERIES 采集形态，对齐 23 §8）。
 *
 * 行=时点/时间、列=指标、格=值。异常值参考范围高亮待后端 crf_reference_range 就绪后接入。
 */
import type { NhpSeriesData } from "../api/nhpWorkbench.api";
import "@/features/aup/aup.css";
import "../nhp.css";

interface Props {
  data?: NhpSeriesData;
  loading?: boolean;
  error?: boolean;
}

export default function NhpSeriesGrid({ data, loading, error }: Props) {
  if (error) {
    return <div style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</div>;
  }
  if (loading) {
    return <div style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载序列…</div>;
  }
  if (!data || data.indicators.length === 0) {
    return <div style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>暂无序列数据</div>;
  }

  return (
    <table className="aup-wb-table">
      <thead>
        <tr>
          <th style={{ width: 90 }}>时点</th>
          {data.indicators.map((ind) => (
            <th key={ind.code} style={{ textAlign: "right" }}>
              {ind.label}
              {ind.unit ? <span style={{ color: "var(--muted)", fontWeight: 400 }}>（{ind.unit}）</span> : null}
            </th>
          ))}
          <th style={{ width: 90 }}>记录人</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row) => (
          <tr key={row.rowId}>
            <td>
              <b>{row.recordedAt ?? row.rowId}</b>
            </td>
            {data.indicators.map((ind) => {
              const v = row.values[ind.code];
              return (
                <td key={ind.code} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {v == null ? "—" : String(v)}
                </td>
              );
            })}
            <td style={{ color: "var(--muted)" }}>{row.recordedBy ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
