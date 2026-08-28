/**
 * NHP 研究总览（项目驾驶舱，三栏固定高度，仅组件内部滚动）：
 * 左 = TP 阶段列表；中 = 表单内容 + 供体/受体 + 最近动态；右 = 项目名称/进度 + 今日待办 + 审核与通知。
 * 路由：/#/nhp/overview
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { appConfirm } from "@/lib/appDialog";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { fetchNhpProjects, type NhpProject, type NhpSubject } from "../../api/nhpRecord.api";
import { fetchNhpTodoBySubject } from "../../api/nhpWorkbench.api";
import { animalTypeLabel } from "../../utils/nhpSubjectLabels";
import type { NhpSurgeryContext } from "../../utils/nhpSurgeryContext";
import { useNhpProjectWorkspace } from "../../hooks/useNhpProjectWorkspace";
import { CAPTURE_FORM_OPTIONS } from "../../api/nhpVisit.api";
import NhpOverviewSubjectCard from "../../components/NhpOverviewSubjectCard";
import NhpOverviewNotificationsPanel from "../../components/NhpOverviewNotificationsPanel";
import NhpOverviewTodosPanel from "../../components/NhpOverviewTodosPanel";
import NhpOverviewActivityPanel from "../../components/NhpOverviewActivityPanel";
import "@/features/aup/aup.css";
import "../../nhp.css";

function subjectCtx(project: NhpProject, s: NhpSubject, role: "供体" | "受体"): NhpSurgeryContext {
  return {
    key: `subject:${s.id}`,
    subjectId: s.id,
    subjectCode: s.subjectCode,
    subjectType: s.subjectType,
    species: s.species,
    sex: s.sex,
    lifecycleStage: project.lifecycleStage ?? undefined,
    currentTp: project.currentTp ?? undefined,
    txDate: project.txDate ?? undefined,
    armCode: undefined,
    label: `${role} ${s.subjectCode}`,
    subtitle: [animalTypeLabel(s.subjectType), s.species].filter(Boolean).join(" · "),
  };
}

function captureFormLabel(cf?: string | null): string {
  return CAPTURE_FORM_OPTIONS.find((o) => o.value === cf)?.label ?? cf ?? "事件面板";
}

function statusShort(status?: string | null): string {
  const s = (status ?? "").toUpperCase();
  if (s === "LOCKED") return "已锁定";
  if (s === "SIGNED") return "已签署";
  if (s === "REVIEWED") return "已复核";
  if (s === "COMPLETE") return "已提交";
  if (s === "DRAFT") return "草稿";
  return status || "—";
}

function isDraftStatus(status?: string | null): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "DRAFT" || s === "IN_REVIEW" || s === "";
}

export default function NhpOverviewPage() {
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const [activeId, setActiveId] = useState<number | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["nhp", "projects", { mine: true }],
    queryFn: () => fetchNhpProjects({ mine: true }),
  });

  const projects = projectsQuery.data ?? [];
  const active = projects.find((p) => p.id === activeId) ?? projects[0] ?? null;

  const w = useNhpProjectWorkspace(active, "portal");

  const donorCtx = useMemo(
    () => (active?.donor ? subjectCtx(active, active.donor, "供体") : null),
    [active],
  );
  const recipientCtx = useMemo(
    () => (active?.recipient ? subjectCtx(active, active.recipient, "受体") : null),
    [active],
  );

  const todosQuery = useQuery({
    queryKey: ["nhp", "todos", "project", active?.id],
    queryFn: async () => {
      const ids = [active?.donor?.id, active?.recipient?.id].filter((x): x is number => x != null);
      const lists = await Promise.all(ids.map((id) => fetchNhpTodoBySubject(id)));
      return lists.flat();
    },
    enabled: Boolean(active),
  });

  const loading = projectsQuery.isLoading;

  return (
    <div className="nhp-cockpit-shell">
      <PortalHeader onOpenLogin={() => navigate("/")} />
      <div className="aup-app aup-app--workbench nhp-cockpit-app">
        <div className="aup-wb nhp-cockpit-wb">
          <header className="nhp-cockpit-header">
            <button type="button" className="btn ghost small nhp-cockpit-back" onClick={goBack}>
              ← 返回
            </button>
            <div className="nhp-cockpit-header-divider" aria-hidden />
            <div className="nhp-cockpit-header-surgery">
              <label className="nhp-cockpit-surgery-label" htmlFor="nhp-project-select">
                本人团队的项目
              </label>
              <select
                id="nhp-project-select"
                className="nhp-cockpit-surgery-select"
                value={active ? String(active.id) : ""}
                onChange={(e) => setActiveId(e.target.value ? Number(e.target.value) : null)}
                disabled={projects.length === 0}
              >
                {projects.length === 0 ? (
                  <option value="">暂无项目</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.projectName || p.txCode || `项目 #${p.id}`}
                    </option>
                  ))
                )}
              </select>
            </div>
          </header>

          <div className="nhp-cockpit-body">
            {loading ? (
              <div className="aup-wb-empty">加载项目…</div>
            ) : !active ? (
              <div className="aup-wb-empty nhp-cockpit-empty">
                <p>暂无项目</p>
                <button type="button" className="btn primary small" onClick={() => navigate("/nhp/fill")}>
                  前往填报入口
                </button>
              </div>
            ) : (
              <div className="nhp-overview-project">
                <div className="nhp-overview-left">
                  <div className="nhp-overview-members">
                    {donorCtx ? <NhpOverviewSubjectCard surgery={donorCtx} /> : null}
                    {recipientCtx ? <NhpOverviewSubjectCard surgery={recipientCtx} /> : null}
                    {!donorCtx && !recipientCtx ? (
                      <section className="nhp-cockpit-card nhp-cockpit-card-empty">尚未登记供体/受体</section>
                    ) : null}
                  </div>
                  <aside className="nhp-tp-rail nhp-overview-rail">
                    {w.visits.map((v) => {
                      const isCur = v.code === active.currentTp;
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
                </div>

                <div className="nhp-overview-center">
                  <div className="aup-wb-panel">
                    <div className="aup-wb-panel-hd">
                      <span className="title">
                        {w.activeVisit ? `${w.activeVisit.code} · ${w.activeVisit.name}` : "表单"}
                      </span>
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
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {w.activeForms.map(({ plan, form }) => {
                          const recs = w.recordsByFormKey.get(form.formKey) ?? [];
                          return (
                            <div
                              key={`${plan.id ?? form.formId}-${w.activeVisit?.id}`}
                              className="aup-wb-row"
                              style={{ padding: "12px 14px", borderBottom: "1px solid var(--border,#E5E7EB)", flexDirection: "column", alignItems: "stretch", gap: 8 }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="lbl" style={{ fontWeight: 600, fontSize: 14 }}>
                                    {form.title || form.formKey}
                                    <span className="aup-wb-chip muted" style={{ marginLeft: 8, fontSize: 11 }}>
                                      {captureFormLabel(plan.captureForm)}
                                    </span>
                                  </div>
                                  <div className="meta" style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                                    {form.formKey}
                                    {recs.length > 0 ? ` · ${recs.length} 份` : " · 可新建"}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  className="btn primary small"
                                  disabled={w.busy === form.formKey}
                                  onClick={() => w.onCreate(form, plan.captureForm)}
                                >
                                  {w.busy === form.formKey ? "…" : "＋ 新建"}
                                </button>
                              </div>
                              {recs.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                                  {recs.map((r) => (
                                    <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                      <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
                                        {r.subjectCode || `#${r.id}`} · {statusShort(r.status)}
                                      </span>
                                      <div style={{ display: "flex", gap: 6 }}>
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

                  <NhpOverviewActivityPanel />
                </div>

                <div className="nhp-overview-right">
                  <div className="aup-wb-panel">
                    <div className="aup-wb-panel-hd">
                      <span className="title">{active.projectName || "未命名项目"}</span>
                    </div>
                    <div className="nhp-cockpit-card-body">
                      <div className="nhp-project-meta">
                        <div className="nhp-project-meta-row"><span>编号</span><span>{active.txCode ?? "待编号"}</span></div>
                        <div className="nhp-project-meta-row"><span>当前 TP</span><span>{active.currentTp ?? "自动推算"}</span></div>
                        <div className="nhp-project-meta-row"><span>进度</span><span>{active.stageLock ? "阶段锁定" : "仅作指示"}</span></div>
                        {active.txDate ? <div className="nhp-project-meta-row"><span>手术日</span><span>{active.txDate}</span></div> : null}
                        {active.txOrgan ? <div className="nhp-project-meta-row"><span>器官</span><span>{active.txOrgan}</span></div> : null}
                        {active.procedureType ? <div className="nhp-project-meta-row"><span>术式</span><span>{active.procedureType}</span></div> : null}
                      </div>
                    </div>
                  </div>

                  <NhpOverviewTodosPanel
                    todos={todosQuery.data ?? []}
                    loading={todosQuery.isLoading}
                    onRecord={() => navigate("/nhp/fill")}
                  />
                  <NhpOverviewNotificationsPanel />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
