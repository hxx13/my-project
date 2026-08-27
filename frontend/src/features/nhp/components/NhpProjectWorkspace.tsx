/**
 * 项目工作区（自包含）：左侧 TP 竖向导航 + 右侧选中 TP 的表单列表 + 顶部进度编辑/锁定。
 * 供 /#/nhp/fill 点进项目、管理端项目详情使用；overview 用 useNhpProjectWorkspace 自行拼两栏。
 */
import { useNavigate } from "react-router-dom";
import { useNhpProjectWorkspace } from "../hooks/useNhpProjectWorkspace";
import { CAPTURE_FORM_OPTIONS } from "../api/nhpVisit.api";
import type { NhpProject } from "../api/nhpRecord.api";
import "../nhp.css";

type Props = {
  project: NhpProject;
  mode?: "portal" | "adminPreview";
};

function captureFormLabel(cf?: string | null): string {
  return CAPTURE_FORM_OPTIONS.find((o) => o.value === cf)?.label ?? cf ?? "事件面板";
}

export default function NhpProjectWorkspace({ project, mode = "portal" }: Props) {
  const navigate = useNavigate();
  const w = useNhpProjectWorkspace(project, mode);

  return (
    <div className="nhp-project-workspace">
      <aside className="nhp-tp-rail">
        {w.visits.map((v) => {
          const isCur = v.code === project.currentTp;
          const isActive = v.code === w.activeTp;
          const count = w.plansByVisit.get(v.id)?.length ?? 0;
          return (
            <div
              key={v.id}
              className={`nhp-tp-node${isActive ? " active" : ""}${isCur ? " current" : ""}`}
              onClick={() => w.setSelectedTp(v.code)}
            >
              <span className="tp-code">{v.code}</span>
              <span className="tp-main">
                <span className="tp-name">{v.name}</span>
                <span className="tp-meta">
                  {v.plannedDays != null ? `D+${v.plannedDays}` : ""}
                  {v.plannedDays != null && count > 0 ? " · " : ""}
                  {count > 0 ? `${count} 表单` : "未配置"}
                </span>
              </span>
              <span className="tp-count">{count}</span>
            </div>
          );
        })}
      </aside>

      <div className="nhp-workspace-main">
        <div className="aup-wb-panel">
          <div className="aup-wb-panel-hd">
            <span className="title">{w.activeVisit ? `${w.activeVisit.code} · ${w.activeVisit.name}` : "表单"}</span>
            <span className="aup-wb-chip muted">{w.activeForms.length} 个表单</span>
          </div>

          {w.loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载表单…</div>
          ) : w.activeForms.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
              {w.activeVisit ? `${w.activeVisit.code} 尚未配置表单` : "该项目尚未配置任何表单"}
              <br />
              请到后台「采集方案」选择该项目并配置各 TP 采集的表单。
            </div>
          ) : (
            <div className="nhp-form-list">
              {w.activeForms.map(({ plan, form }) => {
                const draftId = w.draftByFormKey.get(form.formKey);
                return (
                  <div key={`${plan.id ?? form.formId}-${w.activeVisit?.id}`} className="nhp-form-tile">
                    <div className="nhp-form-tile-main">
                      <div className="nhp-form-tile-title">
                        {form.title || form.formKey}
                        <span className="aup-wb-chip muted" style={{ fontSize: 11 }}>
                          {captureFormLabel(plan.captureForm)}
                        </span>
                      </div>
                      <div className="nhp-form-tile-sub">
                        <span className="nhp-form-tile-key">{form.formKey}</span>
                        {draftId ? <span className="aup-wb-chip">草稿</span> : <span className="aup-wb-chip muted">可新建</span>}
                      </div>
                    </div>
                    <div className="nhp-form-tile-acts">
                      {draftId ? (
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => navigate(w.fillPath(draftId, form.formKey, plan.captureForm))}
                        >
                          续填
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn primary small"
                        disabled={w.busy === form.formKey}
                        onClick={() => w.onCreate(form, plan.captureForm)}
                      >
                        {w.busy === form.formKey ? "…" : draftId ? "新建" : "填写"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
