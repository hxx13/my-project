/**
 * NHP 时间线条（day0 锚点 + TP01~TP12 导航，对齐 23 §6）。
 *
 * 术前 TP 锚定入组/计划手术日，术后锚定 day0；事件触发类（TP10）用虚线表示不预展开。
 */
import type { NhpVisit } from "../api/nhpVisit.api";
import "@/features/aup/aup.css";
import "../nhp.css";

interface Props {
  visits: NhpVisit[];
  currentTp?: string | null;
  day0?: string | null;
  onSelect?: (code: string) => void;
}

export default function NhpTimelineStrip({ visits, currentTp, day0, onSelect }: Props) {
  const sorted = [...visits].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const currentIdx = sorted.findIndex((v) => v.code === currentTp);

  return (
    <div className="timeline" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
          时间线
        </span>
        {day0 ? (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>手术日 {day0} · day 0</span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--warn)" }}>术前 · 无 day0（锚定入组/计划手术日）</span>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {sorted.map((v) => {
          const idx = sorted.findIndex((x) => x.code === v.code);
          const isDone = currentIdx >= 0 && idx < currentIdx;
          const isCur = v.code === currentTp;
          const isEvent = (v.eventAnchor ?? "").toUpperCase() === "EVENT";
          const base: React.CSSProperties = {
            flex: "0 0 auto",
            minWidth: 104,
            padding: "9px 12px",
            borderRadius: 9,
            border: isEvent ? "1px dashed #D8B4FE" : "1px solid var(--border)",
            background: isCur ? "var(--primary)" : isDone ? "var(--success-weak)" : isEvent ? "#FBF7FF" : "#fff",
            cursor: "pointer",
            position: "relative",
          };
          return (
            <div key={v.code} style={base} onClick={() => onSelect?.(v.code)}>
              <div style={{ fontSize: 12, fontWeight: 800, color: isCur ? "#fff" : isDone ? "var(--success)" : isEvent ? "#7C3AED" : "var(--text)" }}>
                {v.code}
              </div>
              <div style={{ fontSize: 11, color: isCur ? "rgba(255,255,255,.85)" : "var(--muted)", marginTop: 1, whiteSpace: "nowrap" }}>
                {v.name}
              </div>
              <div style={{ fontSize: 10, color: isCur ? "rgba(255,255,255,.85)" : "var(--slate)", marginTop: 2, whiteSpace: "nowrap" }}>
                {v.earlyDays != null || v.lateDays != null ? `${v.earlyDays ?? ""}~${v.lateDays ?? ""}d` : ""}
              </div>
              {isDone && (
                <span style={{ position: "absolute", top: 7, right: 8, color: "var(--success)", fontWeight: 800, fontSize: 12 }}>✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
