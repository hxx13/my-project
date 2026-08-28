/**
 * NHP 填报入口（/#/nhp/fill 无 id）：
 * 项目计划书页 —— 列出已有项目 + 新建项目计划书（项目名称/描述/器官/术式/手术日）。
 * 项目编号由后端按临时规则生成；项目与实验内容无关。
 * 点进项目后全宽渲染 NhpProjectWorkspace（左侧 TP 导航 + 右侧表单）。
 */
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { authStorage } from "@/features/auth/authStorage";
import { createNhpProject, fetchNhpProjects, type NhpProject } from "../api/nhpRecord.api";
import NhpProjectWorkspace from "./NhpProjectWorkspace";
import "@/features/aup/aup.css";
import "../nhp.css";

type Props = {
  mode?: "portal" | "adminPreview";
};

type View = "list" | "create" | "project";

export default function NhpFillEntryGate({ mode = "portal" }: Props) {
  const isAdmin = mode === "adminPreview";
  const leaveGate = useGoBack(isAdmin ? "/nhp/overview" : "/", { preferHistory: !isAdmin });
  const qc = useQueryClient();

  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<NhpProject | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  /** 进入项目工作区：projectId 写进 URL，保证「返回」能回退到项目而非项目列表 */
  const openProject = (p: NhpProject) => {
    setSelected(p);
    setView("project");
    setSearchParams({ projectId: String(p.id) });
  };

  const [projectName, setProjectName] = useState("");
  const [remark, setRemark] = useState("");
  const [txOrgan, setTxOrgan] = useState("");
  const [procedureType, setProcedureType] = useState("");
  const [txDate, setTxDate] = useState("");

  const mine = mode === "portal";
  const projectsQuery = useQuery({
    queryKey: ["nhp", "projects", { mine }],
    queryFn: () => fetchNhpProjects({ mine }),
  });

  const createMut = useMutation({
    mutationFn: (body: Parameters<typeof createNhpProject>[0]) => createNhpProject(body),
    onSuccess: (r) => {
      toast.success(`项目 ${r.project.txCode ?? ""} 已创建`);
      qc.invalidateQueries({ queryKey: ["nhp", "projects", { mine }] });
      openProject(r.project);
    },
    onError: (e: Error) => toast.error(e.message || "创建项目失败", { duration: 6000 }),
  });

  const onBack = () => {
    if (view === "project") {
      setSelected(null);
      setView("list");
      setSearchParams({}, { replace: true });
      return;
    }
    if (view === "create") {
      setView("list");
      return;
    }
    leaveGate();
  };

  const submitCreate = () => {
    const u = authStorage.getUserInfo();
    const createdBy = u?.displayName ?? u?.displayNickname ?? u?.username;
    createMut.mutate({
      projectName: projectName.trim() || undefined,
      remark: remark.trim() || undefined,
      txOrgan: txOrgan.trim() || undefined,
      procedureType: procedureType.trim() || undefined,
      txDate: txDate || undefined,
      createdBy,
    });
  };

  const projects = projectsQuery.data ?? [];

  // 从 /nhp/fill?projectId=123 进入时恢复项目视图
  useEffect(() => {
    if (view !== "list") return;
    const pid = searchParams.get("projectId");
    if (!pid) return;
    const p = projectsQuery.data?.find((x) => String(x.id) === pid);
    if (p) {
      setSelected(p);
      setView("project");
    }
  }, [view, searchParams, projectsQuery.data]);

  const projectTitle = selected
    ? selected.projectName || selected.txCode || "未命名项目"
    : "";

  if (view === "project" && selected) {
    return (
      <div className="nhp-project-shell">
        <button type="button" className="btn ghost small" onClick={onBack}>
          ← 返回项目列表
        </button>
        <div className="nhp-project-header-card">
          <div className="nhp-project-header-top">
            <h2>{projectTitle}</h2>
            <div className="nhp-project-header-badges">
              {selected.status ? <span className="aup-wb-chip">{selected.status}</span> : null}
              <span className="aup-wb-chip muted">{selected.stageLock ? "阶段锁定" : "仅作进度指示"}</span>
            </div>
          </div>
          <div className="nhp-project-header-meta">
            <span>编号 <b>{selected.txCode ?? "待编号"}</b></span>
            <span>当前 TP <b>{selected.currentTp ?? "自动推算"}</b></span>
            {selected.txDate ? <span>手术日 <b>{selected.txDate}</b></span> : null}
            {selected.txOrgan ? <span>器官 <b>{selected.txOrgan}</b></span> : null}
            {selected.procedureType ? <span>术式 <b>{selected.procedureType}</b></span> : null}
          </div>
          {selected.remark ? <div className="nhp-project-header-remark">{selected.remark}</div> : null}
        </div>
        <NhpProjectWorkspace project={selected} mode={mode} />
      </div>
    );
  }

  return (
    <div className="aup-landing-wrap">
      <div className="aup-landing nhp-fill-gate" style={{ maxWidth: 920, textAlign: "left" }}>
        <button type="button" className="btn ghost small aup-landing-back" onClick={onBack}>
          ← 返回
        </button>
        <h2 style={{ textAlign: "center" }}>NHP 项目计划书</h2>
        <div className="aup-landing-desc" style={{ textAlign: "center", marginBottom: 16 }}>
          项目是实验流程的顶层文件夹，与实验内容无关。建立后由后台在「采集方案」里为该项目配置每个 TP 的表单。
        </div>

        {view === "list" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button type="button" className="btn primary" onClick={() => setView("create")}>
                ＋ 新建项目计划书
              </button>
            </div>

            {projectsQuery.isLoading ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载中…</div>
            ) : projects.length === 0 ? (
              <div className="nhp-fill-gate-panel">
                <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
                  还没有项目。点击「新建项目计划书」，填写项目名称、描述即可创建。
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="aup-wb-row"
                    style={{ padding: "12px 14px", cursor: "pointer" }}
                    onClick={() => openProject(p)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="lbl" style={{ fontWeight: 600 }}>
                        {p.projectName || "未命名项目"}
                        {p.txCode ? <span className="aup-wb-chip muted" style={{ marginLeft: 8 }}>{p.txCode}</span> : null}
                      </div>
                      <div className="meta" style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {p.txCode ? "" : "待编号 · "}
                        {p.status ?? "—"}
                        {p.txDate ? ` · 手术日 ${p.txDate}` : ""}
                        {p.txOrgan ? ` · ${p.txOrgan}` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 16, color: "var(--muted)" }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "create" && (
          <div className="nhp-fill-gate-panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>项目名称 *</label>
              <input
                className="input"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="如：猴-猪原位肝移植 A 方案"
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>描述备注</label>
              <textarea
                className="textarea"
                rows={3}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="项目目标、注意事项等（可选）"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>器官</label>
                <input
                  className="input"
                  type="text"
                  value={txOrgan}
                  onChange={(e) => setTxOrgan(e.target.value)}
                  placeholder="如 心脏 / 肝脏"
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>术式</label>
                <input
                  className="input"
                  type="text"
                  value={procedureType}
                  onChange={(e) => setProcedureType(e.target.value)}
                  placeholder="如 原位移植"
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>计划手术日</label>
                <input
                  className="input"
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => setView("list")}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!projectName.trim() || createMut.isPending}
                onClick={submitCreate}
              >
                {createMut.isPending ? "创建中…" : "创建项目"}
              </button>
            </div>
          </div>
        )}

        {isAdmin && (
          <div style={{ marginTop: 20, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
            <Link to="/content-manager/nhp-records" className="nhp-admin-preview-link">
              项目管理
            </Link>
            {" · "}
            <Link to="/content-manager/nhp-event-assignment" className="nhp-admin-preview-link">
              采集方案
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
