/**
 * 项目工作区（自包含）：左侧 TP 竖向导航 + 右侧选中 TP 的表单列表 + 顶部进度编辑/锁定。
 * 供 /#/nhp/fill 点进项目、管理端项目详情使用；overview 用 useNhpProjectWorkspace 自行拼两栏。
 */
import { useNavigate } from "react-router-dom";
import { useNhpProjectWorkspace } from "../hooks/useNhpProjectWorkspace";
import type { NhpProject } from "../api/nhpRecord.api";
import { isCompositeTemplate, type NhpTemplateListItem } from "../api/nhpTemplate.api";
import type { NhpProjectVisitPlan } from "../api/nhpVisit.api";
import NhpTemplateStructurePreview from "./NhpTemplateStructurePreview";
import { appConfirm } from "@/lib/appDialog";
import "../nhp.css";

type Props = {
  project: NhpProject;
  mode?: "portal" | "adminPreview";
};

function captureFormLabel(cf?: string | null): string {
  if (cf === "LEDGER") return "台账";
  if (cf === "SERIES") return "序列网格";
  return ""; // PANEL / 未配置 = 普通表单，不额外标注
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

function FormRecordList({
  recs,
  fillPath,
  onDelete,
}: {
  recs: { id: number; status: string; subjectCode?: string }[];
  fillPath: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  if (recs.length === 0) return null;
  return (
    <div className="nhp-form-records">
      {recs.map((r) => (
        <div key={r.id} className="nhp-form-record-row">
          <span className="nhp-form-record-meta">
            {r.subjectCode || `#${r.id}`}
            {" · "}
            {recordStatusLabel(r.status)}
          </span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" className="btn ghost small" onClick={() => fillPath(r.id)}>
              {isDraftStatus(r.status) ? "续填" : "查看"}
            </button>
            <button
              type="button"
              className="btn danger small"
              onClick={async () => {
                if (await appConfirm(`删除实例「${r.subjectCode || `#${r.id}`}」？此操作不可恢复。`, { danger: true })) {
                  onDelete(r.id);
                }
              }}
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NhpProjectWorkspace({ project, mode = "portal" }: Props) {
  const navigate = useNavigate();
  const w = useNhpProjectWorkspace(project, mode);

  const expanded = w.expandedFormKey
    ? w.activeForms.find((x) => x.form.formKey === w.expandedFormKey)
    : undefined;

  return (
    <div className="nhp-project-workspace">
      <aside className="nhp-tp-rail">
        {w.visits.map((v) => {
          const isCur = v.code === project.currentTp;
          const isActive = v.code === w.activeTp;
          return (
            <div
              key={v.id}
              className={`nhp-tp-node${isActive ? " active" : ""}${isCur ? " current" : ""}`}
              onClick={() => w.setSelectedTp(v.code)}
            >
              <span className="tp-code">{v.code}</span>
              <span className="tp-name">{v.name}</span>
            </div>
          );
        })}
      </aside>

      <div className="nhp-workspace-main">
        <div className="aup-wb-panel">
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
                const isExpanded = w.expandedFormKey === form.formKey;
                const isHidden = w.expandedFormKey != null && !isExpanded;
                return (
                  <div
                    key={`${plan.id ?? form.formId}-${w.activeVisit?.id}`}
                    className={`nhp-form-tile nhp-form-tile--col${isExpanded ? " selected" : ""}`}
                    style={isHidden ? { display: "none" } : undefined}
                    onClick={() => w.setExpandedFormKey(form.formKey)}
                  >
                    <div className="nhp-form-tile-hd">
                      <div className="nhp-form-tile-main">
                        <div className="nhp-form-tile-title">
                          {form.title || form.formKey}
                          {captureFormLabel(plan.captureForm) ? (
                            <span className="aup-wb-chip muted" style={{ fontSize: 11 }}>
                              {captureFormLabel(plan.captureForm)}
                            </span>
                          ) : null}
                        </div>
                        <div className="nhp-form-tile-sub">
                          {isCompositeTemplate(form) ? "组合快照" : "数据域原子"} · v{form.publishedVersion ?? form.version} · {recs.length} 份记录
                        </div>
                      </div>
                      {!isExpanded && (
                        <div className="nhp-form-tile-acts">
                          <button
                            type="button"
                            className="btn primary small"
                            disabled={w.busy === form.formKey}
                            onClick={(e) => {
                              e.stopPropagation();
                              w.onCreate(form, plan.captureForm);
                            }}
                          >
                            {w.busy === form.formKey ? "…" : "＋ 新建"}
                          </button>
                        </div>
                      )}
                    </div>
                    {!isExpanded && (
                      <FormRecordList
                        recs={recs}
                        fillPath={(id) => navigate(w.fillPath(id, form.formKey, plan.captureForm))}
                        onDelete={w.deleteRecord}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {w.expandedFormKey && expanded && (
          <div className="aup-wb-panel nhp-form-expanded">
            <div className="nhp-form-expanded-hd">
              <div className="nhp-form-tile-title">
                {expanded.form.title || expanded.form.formKey}
                {captureFormLabel(expanded.plan.captureForm) ? (
                  <span className="aup-wb-chip muted" style={{ fontSize: 11 }}>
                    {captureFormLabel(expanded.plan.captureForm)}
                  </span>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn primary small"
                  disabled={w.busy === expanded.form.formKey}
                  onClick={() => w.onCreate(expanded.form, expanded.plan.captureForm)}
                >
                  {w.busy === expanded.form.formKey ? "…" : "＋ 新建"}
                </button>
                <button type="button" className="btn ghost small" onClick={() => w.setExpandedFormKey(null)}>
                  × 收起
                </button>
              </div>
            </div>
            <NhpTemplateStructurePreview template={w.expandedTemplate} />
            <FormRecordList
              recs={w.recordsByFormKey.get(expanded.form.formKey) ?? []}
              fillPath={(id) => navigate(w.fillPath(id, expanded.form.formKey, expanded.plan.captureForm))}
              onDelete={w.deleteRecord}
            />
          </div>
        )}
      </div>
    </div>
  );
}
