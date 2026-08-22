/**
 * 驾驶舱左侧 · 研究对象档案卡（完整身份信息 + 移植上下文）
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

type Props = {
  surgery: NhpSurgeryContext;
  todoCount?: number;
  overdueCount?: number;
};

export default function NhpOverviewSubjectCard({ surgery, todoCount, overdueCount }: Props) {
  const typeCls =
    surgery.subjectType?.toUpperCase() === "DONOR"
      ? "donor"
      : surgery.subjectType?.toUpperCase() === "RECIPIENT"
        ? "recipient"
        : "";

  return (
    <section className="nhp-cockpit-card nhp-cockpit-subject">
      <header className="nhp-cockpit-card-hd">
        <div>
          <h2 className="nhp-cockpit-subject-code">{surgery.subjectCode}</h2>
          <p className="nhp-cockpit-subject-role">{animalTypeLongLabel(surgery.subjectType)}</p>
        </div>
        {typeCls ? <span className={`nhp-cockpit-type-badge ${typeCls}`}>{animalTypeLabel(surgery.subjectType)}</span> : null}
      </header>

      <dl className="nhp-cockpit-kv">
        <div className="nhp-cockpit-kv-row">
          <dt>手术臂</dt>
          <dd>{armCodeLabel(surgery.armCode)}</dd>
        </div>
        <div className="nhp-cockpit-kv-row">
          <dt>物种 / 性别</dt>
          <dd>
            {surgery.species ?? "—"}
            <span className="nhp-cockpit-kv-sep">·</span>
            {sexLabel(surgery.sex)}
          </dd>
        </div>
        <div className="nhp-cockpit-kv-row">
          <dt>生命周期</dt>
          <dd>
            <span className="nhp-cockpit-stage-pill">{lifecycleStageLabel(surgery.lifecycleStage)}</span>
          </dd>
        </div>
        <div className="nhp-cockpit-kv-row">
          <dt>手术日 (day0)</dt>
          <dd>{surgery.txDate ?? <span className="muted">术前</span>}</dd>
        </div>
        <div className="nhp-cockpit-kv-row">
          <dt>当前时点</dt>
          <dd className="nhp-cockpit-kv-strong">{surgery.currentTp ?? "—"}</dd>
        </div>
      </dl>

      <footer className="nhp-cockpit-subject-foot">
        <div className="nhp-cockpit-stat">
          <span className="nhp-cockpit-stat-n">{todoCount ?? surgery.todoCount ?? 0}</span>
          <span className="nhp-cockpit-stat-l">待办</span>
        </div>
        {(overdueCount ?? surgery.overdueCount ?? 0) > 0 ? (
          <div className="nhp-cockpit-stat nhp-cockpit-stat--warn">
            <span className="nhp-cockpit-stat-n">{overdueCount ?? surgery.overdueCount}</span>
            <span className="nhp-cockpit-stat-l">超时</span>
          </div>
        ) : null}
      </footer>
    </section>
  );
}
