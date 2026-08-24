/**
 * 驾驶舱顶栏：[← 返回] · 流水灯时间线 · 本人参与的手术选择器 · 快捷操作
 */
import { useNavigate } from "react-router-dom";
import type { NhpSurgeryContext } from "../utils/nhpSurgeryContext";
import { lifecycleStageLabel } from "../api/nhpSubjectBoard.api";
import NhpOverviewTimelineMarquee from "./NhpOverviewTimelineMarquee";
import "../nhp.css";

type Props = {
  onBack: () => void;
  surgeries: NhpSurgeryContext[];
  active: NhpSurgeryContext | null;
  activeKey: string | null;
  onSelectSurgery: (key: string) => void;
};

export default function NhpOverviewCockpitHeader({
  onBack,
  surgeries,
  active,
  activeKey,
  onSelectSurgery,
}: Props) {
  const navigate = useNavigate();

  return (
    <header className="nhp-cockpit-header">
      <button type="button" className="btn ghost small nhp-cockpit-back" onClick={onBack}>
        ← 返回
      </button>

      <div className="nhp-cockpit-header-divider" aria-hidden />

      <div className="nhp-cockpit-header-timeline">
        {active ? (
          <NhpOverviewTimelineMarquee
            currentTp={active.currentTp}
            day0={active.txDate}
            lifecycleStage={lifecycleStageLabel(active.lifecycleStage)}
          />
        ) : (
          <div className="nhp-cockpit-marquee nhp-cockpit-marquee--empty">
            <span className="nhp-cockpit-marquee-stage">选择手术实例以查看进度</span>
          </div>
        )}
      </div>

      <div className="nhp-cockpit-header-divider" aria-hidden />

      <div className="nhp-cockpit-header-surgery">
        <label className="nhp-cockpit-surgery-label" htmlFor="nhp-surgery-select">
          本人参与的手术
        </label>
        <select
          id="nhp-surgery-select"
          className="nhp-cockpit-surgery-select"
          value={activeKey ?? ""}
          onChange={(e) => onSelectSurgery(e.target.value)}
          disabled={surgeries.length === 0}
        >
          {surgeries.length === 0 ? (
            <option value="">暂无参与中的手术</option>
          ) : (
            surgeries.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
                {(s.todoCount ?? 0) > 0 ? ` (${s.todoCount} 待办)` : ""}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="nhp-cockpit-header-actions">
        <button type="button" className="btn primary small" onClick={() => navigate("/nhp/fill")}>
          ＋ 记录事件
        </button>
      </div>
    </header>
  );
}
