/**
 * 笼位表单发布列表 — 对齐 NhpTemplateListPage。
 * 展示真实模板列表（原子 + 组合），支持重新生成/发布/解冻；右侧结构树。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm } from "@/lib/appDialog";
import {
  composeCageTemplates,
  deleteCageTemplate,
  fetchCageTemplate,
  fetchCageTemplates,
  publishCageTemplate,
  regenerateCageTemplates,
  unfreezeCageTemplate,
  type CageTemplateSummary,
} from "../api/cageForm.api";
import { CageFormPageShell } from "../components/CageFormPageShell";
import { CageFormModalPortal } from "../components/CageFormModalPortal";
import { cageFormEditPath } from "../cageFormConstants";
import { typeLabelOf } from "@/features/nhp/schema/typeRegistry";
import "@/features/aup/aup.css";
import "@/features/nhp/nhp.css";
import "../cage-form.css";

type PublishFilter = "PUBLISHED" | "ALL";

const PUBLISH_FILTERS: { value: PublishFilter; label: string }[] = [
  { value: "PUBLISHED", label: "已发布" },
  { value: "ALL", label: "含草稿" },
];

const KIND_LABEL: Record<string, string> = { ATOM: "原子模板", COMPOSITE: "组合模板" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "草稿", FROZEN: "已发布", ARCHIVED: "已归档" };
const DATA_TYPE_LABEL: Record<string, string> = { number: "数值", text: "文本", boolean: "布尔" };
function fieldTypeOrDataType(f: { fieldType?: string | null; dataType?: string }): string {
  return (f.fieldType && typeLabelOf(f.fieldType as never)) || f.fieldType || f.dataType || "—";
}

export default function CageFormListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [publishFilter, setPublishFilter] = useState<PublishFilter>("PUBLISHED");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ formKey: "", title: "", atoms: [] as string[] });

  const role = authStorage.getRole() || "";
  const canMaintain = hasMinRole(role, "ADMIN");

  const listQuery = useQuery({ queryKey: ["cage-info", "templates"], queryFn: fetchCageTemplates });
  const detailQuery = useQuery({
    queryKey: ["cage-info", "template", "detail", selectedKey],
    queryFn: () => fetchCageTemplate(selectedKey!),
    enabled: !!selectedKey,
  });

  const templates = listQuery.data ?? [];
  const detail = detailQuery.data;

  const filtered = useMemo(() => {
    if (publishFilter === "ALL") return templates;
    return templates.filter((t) => t.status === "FROZEN");
  }, [templates, publishFilter]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cage-info", "templates"] });
    if (selectedKey) void qc.invalidateQueries({ queryKey: ["cage-info", "template", "detail", selectedKey] });
  };

  const regenerateMut = useMutation({
    mutationFn: () => regenerateCageTemplates(),
    onSuccess: (r) => {
      toast.success(`已重建 ${r.atomCount} 个原子模板 + 组合模板`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "重建失败"),
  });

  const composeMut = useMutation({
    mutationFn: (body: { formKey: string; title?: string; atoms: string[] }) => composeCageTemplates(body),
    onSuccess: (d) => {
      toast.success(`已组合「${d.title}」`);
      setComposeOpen(false);
      setComposeForm({ formKey: "", title: "", atoms: [] });
      invalidate();
      setSelectedKey(d.formKey);
    },
    onError: (e: Error) => toast.error(e.message || "组合失败"),
  });

  const publishMut = useMutation({
    mutationFn: (formKey: string) => publishCageTemplate(formKey),
    onSuccess: () => {
      toast.success("已发布");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  const unfreezeMut = useMutation({
    mutationFn: (formKey: string) => unfreezeCageTemplate(formKey),
    onSuccess: () => {
      toast.success("已解冻");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (formKey: string) => deleteCageTemplate(formKey),
    onSuccess: () => {
      toast.success("已删除模板");
      setSelectedKey(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
  });

  const confirmDeleteTemplate = async () => {
    if (!detail) return;
    if (!(await appConfirm(`删除模板「${detail.title || detail.formKey}」（${detail.formKey}）？原子被组合钉住时将拒绝。`))) return;
    deleteMut.mutate(detail.formKey);
  };

  const confirmRegenerate = async () => {
    if (!(await appConfirm("从字典套结构 + 已发布字段重建全部原子/组合模板？将覆盖现有模板结构。"))) return;
    regenerateMut.mutate();
  };

  const selectTemplate = (t: CageTemplateSummary) => {
    setSelectedKey(t.formKey);
  };

  const toolbar = (
    <>
      <div className="nhp-template-tabs" role="tablist" aria-label="发布状态">
        {PUBLISH_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            className={`nhp-template-tab${publishFilter === f.value ? " on" : ""}`}
            onClick={() => setPublishFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <span className="aup-wb-count ml-2">共 {filtered.length} 个</span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {canMaintain && (
          <>
            <AdminButton
              type="button"
              tone="primary"
              size="sm"
              onClick={() => setComposeOpen(true)}
            >
              ＋ 组合原子域
            </AdminButton>
            <AdminButton
              type="button"
              tone="ghost"
              size="sm"
              disabled={regenerateMut.isPending}
              onClick={() => void confirmRegenerate()}
            >
              重新生成
            </AdminButton>
          </>
        )}
        <AdminButton
          type="button"
          tone="ghost"
          size="sm"
          title="查看表单审计记录"
          onClick={() => navigate(toAdminRoutePath("/admin/cage-shelves/forms/audit"))}
        >
          📋 审计
        </AdminButton>
        <AdminButton
          type="button"
          tone="ghost"
          size="sm"
          title="维护字段字典与码表"
          onClick={() => navigate(toAdminRoutePath("/admin/cage-shelves/forms/manage"))}
        >
          🗂️ 管理字段
        </AdminButton>
      </div>
    </>
  );

  const atomTemplates = useMemo(() => templates.filter((t) => t.kind === "ATOM"), [templates]);
  const toggleAtom = (formKey: string) => {
    setComposeForm((prev) => ({
      ...prev,
      atoms: prev.atoms.includes(formKey) ? prev.atoms.filter((k) => k !== formKey) : [...prev.atoms, formKey],
    }));
  };

  return (
    <>
    <CageFormPageShell backTo="/admin/cage-shelves" toolbar={toolbar}>
      <div className="aup-app aup-app--workbench cage-form-wb nhp-template-admin min-h-0 flex-1">
        <div className="aup-wb">
          <div className="aup-wb-split aup-wb-split--wide-aside nhp-template-split">
            <aside className="aup-wb-aside">
              {listQuery.isLoading && (
                <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载中…</div>
              )}
              {!listQuery.isLoading && filtered.length === 0 && (
                <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                  暂无模板。请先维护字段并「重新生成」，或发布已有模板。
                </div>
              )}
              {filtered.map((t) => (
                <div
                  key={t.formKey}
                  className={`aup-wb-row${selectedKey === t.formKey ? " on" : ""}`}
                  style={{ paddingLeft: 10, cursor: "pointer" }}
                  onClick={() => selectTemplate(t)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lbl" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="nhp-kind-chip">{KIND_LABEL[t.kind] ?? t.kind}</span>
                      <span>{t.title}</span>
                    </div>
                    <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                      {t.formKey} · v{t.version ?? 1}
                      {t.kind === "COMPOSITE" ? ` · ${t.atomCount ?? 0} 原子` : ""}
                    </div>
                  </div>
                  <span className={`aup-wb-chip${t.status === "FROZEN" ? "" : " muted"}`}>
                    {STATUS_LABEL[t.status ?? ""] ?? t.status ?? "—"}
                  </span>
                </div>
              ))}
            </aside>

            <div className="aup-wb-main">
              {!detail && <div className="aup-wb-empty">选左侧模板查看详情</div>}

              {detail && (
                <div className="aup-wb-panel nhp-template-detail">
                  <div className="aup-wb-panel-hd">
                    <span className="title">{detail.title || detail.formKey}</span>
                    <span className="aup-wb-chip">{KIND_LABEL[detail.kind] ?? detail.kind}</span>
                    <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>{detail.formKey}</span>
                    <span className="aup-wb-chip muted">预览 v{detail.version ?? 1}</span>
                    <div style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="btn small ghost"
                      onClick={() => navigate(toAdminRoutePath(cageFormEditPath(detail.formKey)))}
                    >
                      {detail.kind === "ATOM" || detail.status === "DRAFT" ? "编辑 ▸" : "查看 ▸"}
                    </button>
                    {canMaintain && detail.kind === "ATOM" && detail.status === "DRAFT" && (
                      <button type="button" className="btn small primary" onClick={() => publishMut.mutate(detail.formKey)}>
                        发布为独立表单
                      </button>
                    )}
                    {canMaintain && detail.kind === "COMPOSITE" && detail.status === "DRAFT" && (
                      <button type="button" className="btn small primary" onClick={() => publishMut.mutate(detail.formKey)}>
                        发布
                      </button>
                    )}
                    {canMaintain && detail.status === "FROZEN" && (
                      <button type="button" className="btn small ghost" onClick={() => unfreezeMut.mutate(detail.formKey)}>
                        解冻
                      </button>
                    )}
                  </div>

                  <p className="nhp-template-detail-hint">
                    {detail.kind === "ATOM"
                      ? "预览仅含该域章节。字段维护请用右上角「管理字段」。"
                      : "组合版本是多原子快照。钉住原子在下方列出。"}
                  </p>

                  <div className="nhp-template-ver-row">
                    <span className="nhp-template-ver-label">本{detail.kind === "ATOM" ? "原子" : "组合"}版本</span>
                    <span className="nhp-ver-chip-wrap">
                      <button
                        type="button"
                        className="nhp-ver-chip active"
                        title={STATUS_LABEL[detail.status ?? ""] ?? detail.status ?? ""}
                      >
                        v{detail.version ?? 1} · {STATUS_LABEL[detail.status ?? ""] ?? detail.status ?? "—"}
                      </button>
                      {canMaintain && (
                        <button type="button" className="nhp-ver-del" title="删除此版本" onClick={() => void confirmDeleteTemplate()}>
                          删
                        </button>
                      )}
                    </span>
                    {canMaintain && (
                      <button
                        type="button"
                        className="btn small ghost"
                        style={{ marginLeft: 8 }}
                        onClick={() => void confirmDeleteTemplate()}
                      >
                        清理全部版本
                      </button>
                    )}
                  </div>

                  {detail.kind === "COMPOSITE" && (detail.atoms?.length ?? 0) > 0 && (
                    <div className="nhp-template-atoms-line">
                      钉住原子：
                      {detail.atoms!.map((a) => (
                        <span key={a.atomCode} className="aup-wb-chip muted" style={{ marginLeft: 4 }}>
                          {a.atomTitle || a.atomCode}
                          <span style={{ fontFamily: "ui-monospace, monospace" }}> · {a.atomFormKey}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="nhp-template-preview-box">
                    <div className="nhp-composer-preview-hd">结构预览（当前选中版本）</div>
                    <div className="nhp-composer-preview-body">
                      {detail.sections.length === 0 ? (
                        <div className="aup-empty small">该版本无结构</div>
                      ) : (
                        <div className="nhp-struct-preview">
                          <div className="nhp-struct-summary">
                            <b>{detail.title || detail.formKey}</b>
                            <span className="muted">
                              {" "} · {detail.kind === "ATOM" ? "数据域原子" : "组合快照"}
                              {detail.version != null ? ` · v${detail.version}` : ""}
                              {" · "}
                              {detail.sections.reduce((n, s) => n + s.fields.length + s.subsections.reduce((m, u) => m + u.fields.length, 0), 0)} 题 · {detail.sections.length} 个章节
                            </span>
                          </div>
                          <ul className="nhp-composer-sec-list nhp-struct-sec-list">
                            {detail.sections.map((sec) => (
                              <li key={sec.code} className="nhp-struct-sec">
                                <div className="nhp-struct-sec-hd">
                                  <b>{sec.code} {sec.label}</b>
                                  <span className="muted">
                                    {" "} · {sec.subsections.length} 子模块
                                    {sec.fields.length > 0 ? ` · 直属 ${sec.fields.length} 题` : ""}
                                  </span>
                                </div>
                                <ul>
                                  {sec.subsections.map((sub) => (
                                    <li key={sub.code} className="nhp-struct-sub">
                                      <div className="nhp-struct-sub-hd">
                                        <b>{sub.code} {sub.label}</b>
                                        <span className="muted"> · {sub.fields.length} 题</span>
                                      </div>
                                      <ul className="nhp-struct-fields">
                                        {sub.fields.map((f) => (
                                          <li key={f.fieldId} className="nhp-struct-field">
                                            <span className="key">{f.canonical}</span>
                                            <span className="lbl">{f.label || f.canonical}</span>
                                            <span className="type">{fieldTypeOrDataType(f)}</span>
                                            {f.required === "YES" ? <span className="req">必填</span> : null}
                                          </li>
                                        ))}
                                      </ul>
                                    </li>
                                  ))}
                                  {sec.fields.length > 0 && (
                                    <li className="nhp-struct-sub">
                                      <div className="nhp-struct-sub-hd">
                                        <b>直属题目</b>
                                        <span className="muted"> · {sec.fields.length} 题</span>
                                      </div>
                                      <ul className="nhp-struct-fields">
                                        {sec.fields.map((f) => (
                                          <li key={f.fieldId} className="nhp-struct-field">
                                            <span className="key">{f.canonical}</span>
                                            <span className="lbl">{f.label || f.canonical}</span>
                                            <span className="type">{fieldTypeOrDataType(f)}</span>
                                            {f.required === "YES" ? <span className="req">必填</span> : null}
                                          </li>
                                        ))}
                                      </ul>
                                    </li>
                                  )}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>更新 {detail.updatedAt ?? "—"}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </CageFormPageShell>

    {composeOpen && (
      <CageFormModalPortal>
        <div className="aup-modal-mask" onClick={() => setComposeOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3>组合原子域</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              勾选要钉进组合表单的原子域，输入组合键与名称；创建后即可发布该组合。
            </p>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <label style={{ fontSize: 13, color: "var(--muted)", width: 76, flexShrink: 0, paddingTop: 8 }}>组合键</label>
              <input
                className="input"
                placeholder="如 cage_detail_v2（formKey，唯一）"
                value={composeForm.formKey}
                onChange={(e) => setComposeForm({ ...composeForm, formKey: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
              <label style={{ fontSize: 13, color: "var(--muted)", width: 76, flexShrink: 0, paddingTop: 8 }}>名称</label>
              <input
                className="input"
                placeholder="组合表单显示名"
                value={composeForm.title}
                onChange={(e) => setComposeForm({ ...composeForm, title: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>选择原子域（{composeForm.atoms.length} 已选）</div>
              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
                {atomTemplates.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)", padding: 8 }}>暂无原子域，请先「重新生成」或发布字段。</div>
                )}
                {atomTemplates.map((a) => (
                  <label key={a.formKey} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={composeForm.atoms.includes(a.formKey)}
                      onChange={() => toggleAtom(a.formKey)}
                    />
                    <span style={{ fontSize: 13 }}>{a.title || a.formKey}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>{a.formKey}</span>
                    <span className="aup-wb-chip muted" style={{ marginLeft: "auto" }}>{STATUS_LABEL[a.status ?? ""] ?? a.status}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setComposeOpen(false)}>取消</button>
              <button
                className="btn primary"
                disabled={!composeForm.formKey.trim() || composeForm.atoms.length === 0 || composeMut.isPending}
                onClick={() =>
                  composeMut.mutate({
                    formKey: composeForm.formKey.trim(),
                    title: composeForm.title.trim() || composeForm.formKey.trim(),
                    atoms: composeForm.atoms,
                  })
                }
              >
                创建组合
              </button>
            </div>
          </div>
        </div>
      </CageFormModalPortal>
    )}
    </>
  );
}
