/**
 * NHP 填报入口（缓冲前）：登记项目 → 填写入组表单（D1 供体 / D2 受体）。
 * 门户 /#/nhp/fill 与管理端 /#/content-manager/nhp-entry（无 id）共用。
 * 只区分「项目」（项目编码），不区分对象；对象在保存表单时才创建并回填编号。
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { authStorage } from "@/features/auth/authStorage";
import { createNhpProject, fetchNhpRecords } from "../api/nhpRecord.api";
import NhpSurgeryFormLauncher from "./NhpSurgeryFormLauncher";
import "@/features/aup/aup.css";
import "../nhp.css";

type Props = {
  mode?: "portal" | "adminPreview";
};

export default function NhpFillEntryGate({ mode = "portal" }: Props) {
  const isAdmin = mode === "adminPreview";
  const leaveGate = useGoBack(isAdmin ? "/nhp/overview" : "/", { preferHistory: !isAdmin });

  const [projectId, setProjectId] = useState<number | null>(null);
  const [registering, setRegistering] = useState(false);

  const recordsQuery = useQuery({
    queryKey: ["nhp", "fill-records", projectId],
    queryFn: () => fetchNhpRecords({ page: 1, size: 100 }),
    enabled: projectId != null,
  });

  const onRegister = async () => {
    setRegistering(true);
    try {
      const u = authStorage.getUserInfo();
      const createdBy = u?.displayName ?? u?.displayNickname ?? u?.username;
      const r = await createNhpProject(createdBy ? { createdBy } : undefined);
      toast.success("已创建项目，请填写入组表单");
      setProjectId(r.project.id);
    } catch (e) {
      toast.error((e as Error).message || "登记项目失败");
    } finally {
      setRegistering(false);
    }
  };

  const onBack = () => {
    if (projectId != null) {
      setProjectId(null);
      return;
    }
    leaveGate();
  };

  return (
    <div className="aup-landing-wrap">
      <div className="aup-landing nhp-fill-gate" style={{ maxWidth: 920, textAlign: "left" }}>
        <button type="button" className="btn ghost small aup-landing-back" onClick={onBack}>
          ← 返回
        </button>
        <h2 style={{ textAlign: "center" }}>NHP 填报</h2>
        <div className="aup-landing-desc" style={{ textAlign: "center", marginBottom: 16 }}>
          {projectId == null
            ? "登记一个项目（一台异种移植 = 供体 + 受体），再填写入组表单。"
            : `项目 #${projectId} · 填写入组表单（供体 D1 / 受体 D2）`}
        </div>

        {projectId == null ? (
          <div className="nhp-fill-gate-panel">
            <p
              style={{
                fontSize: 12,
                color: "var(--muted)",
                lineHeight: 1.6,
                marginBottom: 12,
                background: "#eef2ff",
                padding: "10px 12px",
                borderRadius: 8,
              }}
            >
              一台异种移植 = 一个项目（供体猪 + 受体猴）。登记后依次填写供体 D1、受体 D2 入组表单；
              研究对象在保存表单时才创建，编号（DON / RCP）自动生成。
            </p>
            <button
              type="button"
              className="btn primary nhp-fill-gate-panel-cta"
              style={{ width: "100%" }}
              disabled={registering}
              onClick={() => void onRegister()}
            >
              {registering ? "登记中…" : "登记项目"}
            </button>
          </div>
        ) : (
          <NhpSurgeryFormLauncher
            projectId={projectId}
            records={recordsQuery.data?.items ?? []}
            mode={mode}
            onCreated={() => void recordsQuery.refetch()}
          />
        )}

        {isAdmin && (
          <div style={{ marginTop: 20, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
            <Link to="/content-manager/nhp-subjects" className="nhp-admin-preview-link">
              研究对象
            </Link>
            {" · "}
            <Link to="/content-manager/nhp-records" className="nhp-admin-preview-link">
              项目管理
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
