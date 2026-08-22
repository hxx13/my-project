/**
 * NHP 台账（LEDGER 采集形态，对齐 23 §8）。
 *
 * 重复子实体列表（样本/给药/AE），每条自动编号 + 摘要 + 时间。条目写实走实体表端点。
 */
import "@/features/aup/aup.css";
import "../nhp.css";

export interface NhpLedgerItem {
  id: number;
  /** 自动编号，如 SMP-…-TP04-EDTA-01 */
  code: string;
  summary: string;
  time?: string;
  status?: string;
}

interface Props {
  title: string;
  meta?: string;
  items?: NhpLedgerItem[];
  loading?: boolean;
  error?: boolean;
  addLabel?: string;
  onAdd?: () => void;
}

export default function NhpLedger({ title, meta, items, loading, error, addLabel = "＋ 新增", onAdd }: Props) {
  return (
    <div className="aup-wb-panel">
      <div className="aup-wb-panel-hd">
        <span className="title">{title}</span>
        {meta ? <span className="aup-wb-chip muted">{meta}</span> : null}
      </div>
      <div style={{ padding: "6px 16px" }}>
        {error ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</div>
        ) : loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>加载台账…</div>
        ) : !items || items.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>暂无记录</div>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}
            >
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{it.code}</span>
              <span style={{ flex: 1, minWidth: 0, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.summary}
              </span>
              {it.status ? <span className="aup-wb-chip muted">{it.status}</span> : null}
              <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>{it.time ?? "—"}</span>
            </div>
          ))
        )}
        {onAdd ? (
          <div style={{ padding: "8px 0 4px" }}>
            <button type="button" className="btn small ghost" style={{ width: "100%", justifyContent: "center" }} onClick={onAdd}>
              {addLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
