/**
 * 手术实例 Tab 切换（overview / fill 共用）。
 */
import type { NhpSurgeryContext } from "../utils/nhpSurgeryContext";
import "../nhp.css";

type Props = {
  surgeries: NhpSurgeryContext[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  title?: string;
};

export default function NhpSurgeryTabs({ surgeries, activeKey, onSelect, title = "本人参与的手术" }: Props) {
  if (surgeries.length === 0) {
    return (
      <div className="nhp-surgery-tabs nhp-surgery-tabs--empty">
        <span className="nhp-surgery-tabs-title">{title}</span>
        <span className="nhp-surgery-tabs-empty">暂无参与中的手术实例</span>
      </div>
    );
  }

  return (
    <div className="nhp-surgery-tabs">
      <span className="nhp-surgery-tabs-title">{title}</span>
      <div className="nhp-surgery-tabs-list" role="tablist">
        {surgeries.map((s) => {
          const on = s.key === activeKey;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={on}
              className={"nhp-surgery-tab" + (on ? " on" : "")}
              onClick={() => onSelect(s.key)}
              title={s.subtitle}
            >
              <span className="nhp-surgery-tab-label">{s.label}</span>
              {s.currentTp ? <span className="nhp-surgery-tab-meta">{s.currentTp}</span> : null}
              {(s.todoCount ?? 0) > 0 ? (
                <span className="nhp-surgery-tab-badge">{s.todoCount}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
