/**
 * 项目文件夹详情：完整 TP 时间线 × 每 TP 的表单（管理者视角，看到所有项目）。
 * 路由：/#/content-manager/nhp-records/project/:projectId
 */
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import ContentManagerWorkbenchLayout from "@/layouts/ContentManagerWorkbenchLayout";
import { fetchNhpProject } from "../../api/nhpRecord.api";
import NhpProjectWorkspace from "../../components/NhpProjectWorkspace";
import "@/features/aup/aup.css";
import "../../nhp.css";

export default function NhpProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = projectId ? Number(projectId) : NaN;
  const goBack = useGoBack("/content-manager/nhp-records");

  const projectQuery = useQuery({
    queryKey: ["nhp", "project", id],
    queryFn: () => fetchNhpProject(id),
    enabled: Number.isFinite(id),
  });

  const project = projectQuery.data;

  const main = projectQuery.isLoading ? (
    <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载中…</div>
  ) : !project ? (
    <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>项目不存在</div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="aup-wb-panel">
        <div className="aup-wb-panel-hd">
          <span className="title">{project.projectName || project.txCode || `项目 #${project.id}`}</span>
          <span className="aup-wb-chip muted">{project.txCode ?? "编号生成中"}</span>
          {project.status ? <span className="aup-wb-chip muted">{project.status}</span> : null}
        </div>
        <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          {project.remark || "（无描述）"}
          {project.txDate ? ` · 手术日 ${project.txDate}` : ""}
          {project.txOrgan ? ` · ${project.txOrgan}` : ""}
          {project.procedureType ? ` · ${project.procedureType}` : ""}
        </div>
      </div>
      <NhpProjectWorkspace project={project} mode="adminPreview" />
    </div>
  );

  return (
    <ContentManagerWorkbenchLayout
      backLabel="← 项目管理"
      onBack={goBack}
      split={false}
      main={main}
    />
  );
}
