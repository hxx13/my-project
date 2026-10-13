import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useReviewerConfig, useUpdateReviewerConfig } from "../../hooks/useAup";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import type { Reviewer } from "../../schema/review";
import "../../aup.css";

/**
 * 审查人名册（只读）。
 *
 * 名单实际由「人员页 → 身份标识」维护（秘书 / 专家两个身份码），本页只做展示与指引。
 * 后端不再写 aup_reviewer，原先的「保存名册配置」必然失败（接口固定返回提示），
 * 那个按钮已移除，避免让人以为能在这里配。
 */
export default function AupReviewerConfigPage() {
  const configQuery = useReviewerConfig();
  const [formatReviewers, setFormatReviewers] = useState<Reviewer[]>([]);
  const [expertCandidates, setExpertCandidates] = useState<Reviewer[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // 首次拿到后端配置时水合到本地展示态
  useEffect(() => {
    if (configQuery.data && !hydrated) {
      setFormatReviewers(configQuery.data.formatReviewers ?? []);
      setExpertCandidates(configQuery.data.expertCandidates ?? []);
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  return (
    <div className="aup-app" style={{ padding: "24px" }}>
      <div className="page-hd">
        <div>
          <h1>审查人名册</h1>
          <div className="sub">格式审查人（秘书）与专家候选，由「人员页 → 身份标识」维护</div>
        </div>
      </div>

      <div
        className="card"
        style={{ padding: "14px 18px", marginBottom: 16, background: "var(--primary-weak, #eef2ff)", color: "var(--primary, #002fa7)", fontSize: 13 }}
      >
        名单已改为按人员身份标识自动识别，本页仅作查看。
        如需增删，请到 <a href="#/console/admin/personnel" style={{ color: "inherit", textDecoration: "underline" }}>人员页</a> 为对应人员设置「秘书」或「专家」身份标识。
      </div>

      {configQuery.isLoading ? (
        <div className="aup-empty">加载中…</div>
      ) : configQuery.isError ? (
        <div className="aup-empty">加载失败，请刷新重试</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, alignItems: "start" }}>
          <ReviewerPanel
            title="格式审查人（秘书）"
            hint="负责格式审查；格式审查通过时在此范围内选定专家"
            members={formatReviewers}
          />
          <ReviewerPanel
            title="专家候选（专家）"
            hint="参与专家审查投票；格式审查时从此名单中分配"
            members={expertCandidates}
          />
        </div>
      )}
    </div>
  );
}

function ReviewerPanel({
  title,
  hint,
  members,
}: {
  title: string;
  hint: string;
  members: Reviewer[];
}) {
  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <b style={{ fontSize: 14 }}>{title}</b>
        <span className="tag" style={{ background: "var(--primary-weak)", color: "var(--primary)" }}>{members.length}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>{hint}</div>

      {members.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0 6px" }}>
          暂无成员。请到人员页为对应人员设置身份标识。
        </div>
      ) : (
        <div>
          {members.map((m) => (
            <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f0f2f6" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{m.name || m.userId}</span>
                {m.dept ? <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>{m.dept}</span> : null}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 11, fontFamily: "monospace" }}>{m.userId}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
