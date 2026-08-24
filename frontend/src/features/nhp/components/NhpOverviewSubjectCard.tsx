/**
 * 驾驶舱左侧 · 研究对象档案卡（供体/受体身份 + 移植上下文）
 */
import { lifecycleStageLabel } from "../api/nhpSubjectBoard.api";
import type { NhpSurgeryContext } from "../utils/nhpSurgeryContext";
import { animalTypeLabel, animalTypeLongLabel } from "../utils/nhpSubjectLabels";
import "../nhp.css";

function armCodeLabel(code?: string): string {
  const u = (code ?? "").toUpperCase();
  if (u === "HEART") return "心脏移植臂";
  if (u === "LIVER") return "体外肝灌注臂";
  return code?.trim() || "—";
}

function sexLabel(s?: string): string {
  if (!s) return "—";
  const u = s.toUpperCase();
  if (u === "M" || u === "MALE") return "♂ 雄";
  if (u === "F" || u === "FEMALE") return "♀ 雌";
  return s;
}

/** 供体猪 / 受体 等角色展示 */
function roleDisplayLabel(type?: string, species?: string): string {
  const role = animalTypeLabel(type);
  const sp = (species ?? "").trim();
  if (role === "供体" || role === "受体") return sp ? `${role}${sp}` : role;
  return animalTypeLongLabel(type);
}

type Props = {
  surgery: NhpSurgeryContext;
  todoCount?: number;
  overdueCount?: number;
};

export default function NhpOverviewSubjectCard({ surgery, todoCount, overdueCount }: Props) {
  const type = surgery.subjectType?.toUpperCase();
  const typeCls = type === "DONOR" ? "donor" : type === "RECIPIENT" ? "recipient" : "";
  const todos = todoCount ?? surgery.todoCount ?? 0;
  const overdue = overdueCount ?? surgery.overdueCount ?? 0;
  const stage = lifecycleStageLabel(surgery.lifecycleStage);

  return (
    <section
      className={`nhp-cockpit-card nhp-cockpit-subject${typeCls ? ` nhp-cockpit-subject--${typeCls}` : ""}`}
      aria-label="研究对象档案"
    >
      <div className="nhp-cockpit-subject-hero">
        <div className="nhp-cockpit-subject-hero-main">
          <span className="nhp-cockpit-subject-eyebrow">研究对象档案</span>
          <div className="nhp-cockpit-subject-title-row">
            <h2 className="nhp-cockpit-subject-code">{surgery.subjectCode}</h2>
            {typeCls ? (
              <span className={`nhp-cockpit-subject-badge nhp-cockpit-subject-badge--${typeCls}`}>
                {roleDisplayLabel(surgery.subjectType, surgery.species)}
              </span>
            ) : null}
          </div>
          <p className="nhp-cockpit-subject-arm">{armCodeLabel(surgery.armCode)}</p>
        </div>
      </div>

      <div className="nhp-cockpit-subject-body">
        <div className="nhp-cockpit-subject-grid" role="list">
          <div className="nhp-cockpit-subject-cell" role="listitem">
            <span className="nhp-cockpit-subject-cell-label">物种</span>
            <span className="nhp-cockpit-subject-cell-value">{surgery.species ?? "—"}</span>
          </div>
          <div className="nhp-cockpit-subject-cell" role="listitem">
            <span className="nhp-cockpit-subject-cell-label">性别</span>
            <span className="nhp-cockpit-subject-cell-value">{sexLabel(surgery.sex)}</span>
          </div>
          <div className="nhp-cockpit-subject-cell nhp-cockpit-subject-cell--wide" role="listitem">
            <span className="nhp-cockpit-subject-cell-label">生命周期</span>
            <span className="nhp-cockpit-subject-stage">{stage}</span>
          </div>
        </div>

        <div className="nhp-cockpit-subject-timeline" aria-label="手术时间轴">
          <div className="nhp-cockpit-subject-tp">
            <span className="nhp-cockpit-subject-tp-label">手术日 day0</span>
            <span className="nhp-cockpit-subject-tp-value">
              {surgery.txDate ?? <span className="muted">术前</span>}
            </span>
          </div>
          <div className="nhp-cockpit-subject-tp-connector" aria-hidden>
            <span className="nhp-cockpit-subject-tp-line" />
            <span className="nhp-cockpit-subject-tp-dot" />
          </div>
          <div className="nhp-cockpit-subject-tp nhp-cockpit-subject-tp--current">
            <span className="nhp-cockpit-subject-tp-label">当前时点</span>
            <span className="nhp-cockpit-subject-tp-value nhp-cockpit-subject-tp-value--strong">
              {surgery.currentTp ?? "—"}
            </span>
          </div>
        </div>
      </div>

      <footer className="nhp-cockpit-subject-foot">
        <div className={`nhp-cockpit-subject-stat${todos > 0 ? " nhp-cockpit-subject-stat--active" : ""}`}>
          <span className="nhp-cockpit-subject-stat-n">{todos}</span>
          <span className="nhp-cockpit-subject-stat-l">待办任务</span>
        </div>
        <div className="nhp-cockpit-subject-foot-divider" aria-hidden />
        <div
          className={`nhp-cockpit-subject-stat${overdue > 0 ? " nhp-cockpit-subject-stat--warn" : ""}`}
        >
          <span className="nhp-cockpit-subject-stat-n">{overdue}</span>
          <span className="nhp-cockpit-subject-stat-l">已超时</span>
        </div>
      </footer>
    </section>
  );
}
