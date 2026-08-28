/**
 * 项目工作区（自包含）：左侧 TP 竖向导航 + 右侧选中 TP 的表单列表 + 顶部进度编辑/锁定。
 * 供 /#/nhp/fill 点进项目、管理端项目详情使用；overview 用 useNhpProjectWorkspace 自行拼两栏。
 */
import { useNavigate } from "react-router-dom";
import { useNhpProjectWorkspace } from "../hooks/useNhpProjectWorkspace";
import { CAPTURE_FORM_OPTIONS } from "../api/nhpVisit.api";
import type { NhpProject } from "../api/nhpRecord.api";
import { appConfirm } from "@/lib/appDialog";
import "../nhp.css";

type Props = {
  project: NhpProject;
  mode?: "portal" | "adminPreview";
};

function captureFormLabel(cf?: string | null): string {
  return CAPTURE_FORM_OPTIONS.find((o) => o.value === cf)?.label ?? cf ?? "事件面板";
}

function recordStatusLabel(status?: string): string {
  const s = (status ?? "").toUpperCase();
  if (s === "LOCKED") return "已锁定";
  if (s === "SIGNED") return "已签署";
  if (s === "REVIEWED") return "已复核";
  if (s === "COMPLETE") return "已提交";
  if (s === "DRAFT" || s === "IN_REVIEW" || s === "") return "草稿";
  return status || "—";
}

function isDraftStatus(status?: string): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "DRAFT" || s === "IN_REVIEW" || s === "";
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
                const recs = w.recordsByFormKey.get(form.formKey) ?? [];
                return (
                  <div key={`${plan.id ?? form.formId}-${w.activeVisit?.id}`} className="nhp-form-tile nhp-form-tile--col">
                    <div className="nhp-form-tile-hd">
                      <div className="nhp-form-tile-main">
                        <div className="nhp-form-tile-title">
                          {form.title || form.formKey}
                          <span className="aup-wb-chip muted" style={{ fontSize: 11 }}>
                            {captureFormLabel(plan.captureForm)}
                          </span>
                        </div>
                        <div className="nhp-form-tile-sub">
                          <span className="nhp-form-tile-key">{form.formKey}</span>
                          {recs.length > 0 ? (
                            <span className="aup-wb-chip">{recs.length} 份</span>
                          ) : (
                            <span className="aup-wb-chip muted">暂无记录</span>
                          )}
                        </div>
                      </div>
                      <div className="nhp-form-tile-acts">
                        <button
                          type="button"
                          className="btn primary small"
                          disabled={w.busy === form.formKey}
                          onClick={() => w.onCreate(form, plan.captureForm)}
                        >
                          {w.busy === form.formKey ? "…" : "＋ 新建"}
                        </button>
                      </div>
                    </div>
                    {recs.length > 0 && (
                      <div className="nhp-form-records">
                        {recs.map((r) => (
                          <div key={r.id} className="nhp-form-record-row">
                            <span className="nhp-form-record-meta">
                              {r.subjectCode || `#${r.id}`}
                              {" · "}
                              {recordStatusLabel(r.status)}
                            </span>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button
                                type="button"
                                className="btn ghost small"
                                onClick={() => navigate(w.fillPath(r.id, form.formKey, plan.captureForm))}
                              >
                                {isDraftStatus(r.status) ? "续填" : "查看"}
                              </button>
                              <button
                                type="button"
                                className="btn danger small"
                                onClick={async () => {
                                  if (await appConfirm(`删除实例「${r.subjectCode || `#${r.id}`}」？此操作不可恢复。`, { danger: true })) {
                                    w.deleteRecord(r.id);
                                  }
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
