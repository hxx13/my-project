import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { useReviewerConfig, useUpdateReviewerConfig } from "../../hooks/useAup";
import { PersonnelPicker } from "@/components/admin/PersonnelPicker";
import type { Reviewer } from "../../schema/review";
import "../../aup.css";

/**
 * 审查人名册配置页。
 * 配置格式审查人（秘书）与专家候选（写入 aup_reviewer）；
 * 选人复用通用 {@link PersonnelPicker}（学生/教职工分 tab + 多选），选中人员的 userId 记录到本地草稿，
 * 保存为全量替换，需点击右上角「保存名册配置」才落库。
 */
export default function AupReviewerConfigPage() {
  const configQuery = useReviewerConfig();
  const updateMut = useUpdateReviewerConfig();

  const [formatReviewers, setFormatReviewers] = useState<Reviewer[]>([]);
  const [expertCandidates, setExpertCandidates] = useState<Reviewer[]>([]);
  const [hydrated, setHydrated] = useState(false);
  /** 当前打开的选人弹窗要写入哪个面板 */
  const [pickerFor, setPickerFor] = useState<"secretary" | "expert" | null>(null);

  // 首次拿到后端配置时水合到本地草稿
  useEffect(() => {
    if (configQuery.data && !hydrated) {
      setFormatReviewers(configQuery.data.formatReviewers ?? []);
      setExpertCandidates(configQuery.data.expertCandidates ?? []);
      setHydrated(true);
    }
  }, [configQuery.data, hydrated]);

  const save = () => {
    updateMut.mutate({
      formatReviewers: formatReviewers.map((r) => r.userId),
      expertCandidates: expertCandidates.map((r) => r.userId),
    });
  };

  const handleConfirm = (ids: string[], names: string[]) => {
    const isSecretary = pickerFor === "secretary";
    const current = isSecretary ? formatReviewers : expertCandidates;
    const existing = new Set(current.map((r) => r.userId));
    const next = [...current];
    let added = 0;
    ids.forEach((id, i) => {
      if (!id || existing.has(id)) return;
      existing.add(id);
      next.push({ userId: id, name: names[i] || id });
      added++;
    });
    if (ids.length > 0 && added === 0) {
      toast.error("所选人员已在名单中");
    }
    if (isSecretary) setFormatReviewers(next);
    else setExpertCandidates(next);
    setPickerFor(null);
  };

  return (
    <div className="aup-app" style={{ padding: "24px" }}>
      <div className="page-hd">
        <div>
          <h1>审查人名册</h1>
          <div className="sub">配置格式审查人（秘书）与专家候选；格式审查通过时在此范围内分配专家，修改后请点击右上角保存</div>
        </div>
        <button className="btn primary" disabled={updateMut.isPending} onClick={save}>
          {updateMut.isPending ? "保存中…" : "保存名册配置"}
        </button>
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
            onChange={setFormatReviewers}
            onAdd={() => setPickerFor("secretary")}
          />
          <ReviewerPanel
            title="专家候选（专家）"
            hint="参与专家审查投票；格式审查时从此名单中分配"
            members={expertCandidates}
            onChange={setExpertCandidates}
            onAdd={() => setPickerFor("expert")}
          />
        </div>
      )}

      {pickerFor &&
        createPortal(
          <PersonnelPicker
            onClose={() => setPickerFor(null)}
            onConfirm={handleConfirm}
          />,
          document.body
        )}
    </div>
  );
}

function ReviewerPanel({
  title,
  hint,
  members,
  onChange,
  onAdd,
}: {
  title: string;
  hint: string;
  members: Reviewer[];
  onChange: (next: Reviewer[]) => void;
  onAdd: () => void;
}) {
  const remove = (userId: string) => onChange(members.filter((m) => m.userId !== userId));

  return (
    <div className="card" style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <b style={{ fontSize: 14 }}>{title}</b>
        <span className="tag" style={{ background: "var(--primary-weak)", color: "var(--primary)" }}>{members.length}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>{hint}</div>

      {members.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0 14px" }}>暂无成员，请点击下方「添加人员」选择</div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {members.map((m) => (
            <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #f0f2f6" }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{m.name || m.userId}</span>
                {m.dept ? <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>{m.dept}</span> : null}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 11, fontFamily: "monospace" }}>{m.userId}</span>
              <button className="btn ghost small" style={{ color: "var(--danger)" }} onClick={() => remove(m.userId)}>移除</button>
            </div>
          ))}
        </div>
      )}

      <button className="btn ghost" onClick={onAdd}>＋ 添加人员</button>
    </div>
  );
}
