import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  archiveAupTemplate,
  composeAupTemplate,
  copyAupTemplate,
  createAupAtom,
  deleteAupTemplate,
  fetchAupTemplateById,
  fetchAupTemplatesByKind,
  fetchAupTemplateUsage,
  publishAupTemplate,
  rejectAupTemplate,
  submitAupTemplateReview,
  unfreezeAupTemplate,
  type TemplateVersionVO,
} from "@/features/aup/api/aup.api";
import AupCompositeComposer, { type AupAtomPick } from "@/features/aup/components/AupCompositeComposer";
import TemplateStructurePreview from "@/features/aup/components/TemplateStructurePreview";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "@/features/nhp/nhp.css";

/* =====================================================================
 * AUP 版本管理：计划书模板 / 原子域 / 组合域 三 tab（kind=PROTOCOL/ATOM/COMPOSITE）。
 * 每个 formKey 一组：版本轨 + 状态机（发布/提交审核/驳回/解冻/归档/新建原子域/新建组合域）。
 * ================================================================== */

type Tab = "PROTOCOL" | "ATOM" | "COMPOSITE";

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: "PROTOCOL", label: "计划书模板", icon: "🧬" },
  { value: "ATOM", label: "原子域", icon: "⚛" },
  { value: "COMPOSITE", label: "组合域", icon: "🧩" },
];

const KIND_LABEL: Record<Tab, string> = {
  PROTOCOL: "计划书模板",
  ATOM: "原子域",
  COMPOSITE: "组合域",
};

function statusMeta(status?: string): { text: string; bg: string; color: string } {
  switch ((status ?? "").toUpperCase()) {
    case "PUBLISHED":
      return { text: "已发布", bg: "#e8f7ee", color: "#16a34a" };
    case "PENDING_REVIEW":
      return { text: "待审核", bg: "#fff7ed", color: "#c2410c" };
    case "DRAFT":
      return { text: "草稿", bg: "#eef2ff", color: "#002FA7" };
    case "ARCHIVED":
      return { text: "已归档", bg: "#f1f5f9", color: "#64748b" };
    default:
      return { text: status || "—", bg: "#eef2f7", color: "#64748b" };
  }
}

/** 按 formKey 分组（含版本轨） */
function groupByFormKey(list: TemplateVersionVO[]): TemplateVersionVO[][] {
  const map = new Map<string, TemplateVersionVO[]>();
  for (const t of list) {
    const arr = map.get(t.formKey) ?? [];
    arr.push(t);
    map.set(t.formKey, arr);
  }
  return Array.from(map.values()).map((arr) =>
    arr.sort((a, b) => (b.version ?? 0) - (a.version ?? 0)),
  );
}

interface AtomModal {
  name: string;
  formKey: string;
  code: string;
  description: string;
}

interface ComposeModal {
  name: string;
  formKey: string;
  description: string;
}

export default function AupTemplateListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("PROTOCOL");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [atomModal, setAtomModal] = useState<AtomModal | null>(null);
  const [composeModal, setComposeModal] = useState<ComposeModal | null>(null);

  const role = authStorage.getRole() || "";
  const canMaintain = hasMinRole(role, "ADMIN");

  const templatesQuery = useQuery({
    queryKey: ["aup", "templates", tab],
    queryFn: () => fetchAupTemplatesByKind(tab),
  });
  const atomTemplatesQuery = useQuery({
    queryKey: ["aup", "templates", "ATOM"],
    queryFn: () => fetchAupTemplatesByKind("ATOM"),
  });

  const usageQuery = useQuery({
    queryKey: ["aup", "template", "usage", previewId],
    queryFn: () => fetchAupTemplateUsage(Number(previewId)),
    enabled: tab === "ATOM" && previewId != null,
  });
  const detailQuery = useQuery({
    queryKey: ["aup", "template", "detail", previewId],
    queryFn: () => fetchAupTemplateById(Number(previewId)),
    enabled: previewId != null,
  });

  const allTemplates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const groups = useMemo(() => groupByFormKey(allTemplates), [allTemplates]);
  const atomTemplates = useMemo(() => atomTemplatesQuery.data ?? [], [atomTemplatesQuery.data]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g[0].formKey === selectedKey) ?? null,
    [groups, selectedKey],
  );
  const selectedVersion = useMemo(() => {
    if (!selectedGroup) return null;
    if (previewId != null) return selectedGroup.find((v) => v.id === previewId) ?? selectedGroup[0];
    return selectedGroup[0];
  }, [selectedGroup, previewId]);

  const selectRow = (versions: TemplateVersionVO[]) => {
    setSelectedKey(versions[0].formKey);
    setPreviewId(versions[0].id);
  };

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["aup", "templates"] });

  const publishMut = useMutation({
    mutationFn: (id: number) => publishAupTemplate(id),
    onSuccess: () => {
      toast.success("已发布");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });
  const archiveMut = useMutation({
    mutationFn: (id: number) => archiveAupTemplate(id),
    onSuccess: () => {
      toast.success("已归档");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "归档失败"),
  });
  const submitMut = useMutation({
    mutationFn: (id: number) => submitAupTemplateReview(id),
    onSuccess: () => {
      toast.success("已提交审核");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) => rejectAupTemplate(id, { comment }),
    onSuccess: () => {
      toast.success("已驳回为草稿");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "驳回失败"),
  });
  const unfreezeMut = useMutation({
    mutationFn: (id: number) => unfreezeAupTemplate(id),
    onSuccess: () => {
      toast.success("已解冻为草稿");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败", { duration: 8000 }),
  });
  const copyMut = useMutation({
    mutationFn: (id: number) => copyAupTemplate(id),
    onSuccess: () => {
      toast.success("已新建版本（版号补位）");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "新建版本失败"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAupTemplate(id),
    onSuccess: () => {
      toast.success("已删除");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
  const createAtomMut = useMutation({
    mutationFn: (body: { formKey?: string; name: string; code?: string; description?: string }) => createAupAtom(body),
    onSuccess: () => {
      toast.success("已新建原子域");
      setAtomModal(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "新建原子域失败"),
  });
  const composeMut = useMutation({
    mutationFn: (body: { formKey?: string; name: string; description?: string; atoms: AupAtomPick[] }) =>
      composeAupTemplate({
        formKey: body.formKey,
        name: body.name,
        description: body.description,
        atoms: body.atoms.map((p) => ({ atomFormKey: p.atomFormKey, atomTemplateId: p.atomTemplateId })),
      }),
    onSuccess: () => {
      toast.success("已新建组合域");
      setComposeModal(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "新建组合域失败"),
  });

  const usageRefs = usageQuery.data?.refs ?? [];

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 76, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  const renderActions = (t: TemplateVersionVO) => {
    const st = (t.status ?? "").toUpperCase();
    const isDraft = st === "DRAFT";
    const isPending = st === "PENDING_REVIEW";
    const isPublished = st === "PUBLISHED";
    const isProtocol = t.kind === "PROTOCOL";
    const isAtom = t.kind === "ATOM";
    return (
      <div className="acts" style={{ flexWrap: "wrap", gap: 6 }}>
        {isProtocol && (
          <button className="btn ghost small" onClick={() => navigate(`/content-manager/aup-template/edit/${t.id}`)}>
            {isDraft ? "编辑 ▸" : "查看 ▸"}
          </button>
        )}
        {canMaintain && isDraft && (
          <button
            className="btn primary small"
            onClick={async () => {
              if (await appConfirm("发布后该版本将冻结并对填写人生效，上一发布版本将归档。确认发布？")) publishMut.mutate(t.id);
            }}
            disabled={publishMut.isPending}
          >
            发布
          </button>
        )}
        {canMaintain && isDraft && (
          <button
            className="btn ghost small"
            disabled={submitMut.isPending}
            onClick={async () => {
              if (await appConfirm("提交审核后进入待审核。确认？")) submitMut.mutate(t.id);
            }}
          >
            提交审核
          </button>
        )}
        {canMaintain && isPending && (
          <>
            <button
              className="btn primary small"
              disabled={publishMut.isPending}
              onClick={async () => {
                if (await appConfirm("通过并发布该版本？上一发布版本将归档。确认？")) publishMut.mutate(t.id);
              }}
            >
              通过并发布
            </button>
            <button
              className="btn danger small"
              disabled={rejectMut.isPending}
              onClick={async () => {
                const note = (await appPrompt("驳回意见（必填）", ""))?.trim() ?? "";
                if (!note) {
                  toast.error("驳回须填写意见");
                  return;
                }
                rejectMut.mutate({ id: t.id, comment: note });
              }}
            >
              驳回
            </button>
          </>
        )}
        {canMaintain && isPublished && (
          <>
            <button
              className="btn ghost small"
              disabled={unfreezeMut.isPending}
              title={isAtom ? "无组合域钉住、无已发布模板引用时可解冻" : "解冻回草稿返修"}
              onClick={async () => {
                if (await appConfirm("解冻该版本为草稿？仅当无组合域钉住/无已发布模板引用时允许。确认？")) unfreezeMut.mutate(t.id);
              }}
            >
              解冻
            </button>
            <button
              className="btn ghost small"
              disabled={archiveMut.isPending}
              onClick={async () => {
                if (await appConfirm("归档后该版本不再对填写人生效。确认归档？")) archiveMut.mutate(t.id);
              }}
            >
              归档
            </button>
          </>
        )}
        {canMaintain && (
          <button
            className="btn primary small"
            disabled={copyMut.isPending}
            title="基于当前最新版克隆新版本（版号自动补位空缺）"
            onClick={() => copyMut.mutate(t.id)}
          >
            新建版本
          </button>
        )}
        {canMaintain && (
          <button
            className="btn danger small"
            disabled={deleteMut.isPending}
            onClick={async () => {
              if (await appConfirm("删除该版本？此操作不可恢复。")) deleteMut.mutate(t.id);
            }}
          >
            删除
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="aup-app aup-app--workbench">
      <div className="aup-wb">
        <div className="nhp-template-top-panel">
          <div className="nhp-template-tabs" role="tablist" aria-label="模板类型">
            {TABS.map((t) => {
              const on = tab === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  className={`nhp-template-tab${on ? " on" : ""}`}
                  onClick={() => {
                    setTab(t.value);
                    setSelectedKey(null);
                    setPreviewId(null);
                  }}
                >
                  {t.icon} {t.label}
                </button>
              );
            })}
          </div>
          <span className="aup-wb-count">共 {groups.length} 个</span>
          <div className="nhp-template-toolbar-actions">
            {tab === "ATOM" && canMaintain && (
              <button className="btn primary small" onClick={() => setAtomModal({ name: "", formKey: "", code: "", description: "" })}>
                ＋ 新建原子域
              </button>
            )}
            {tab === "COMPOSITE" && canMaintain && (
              <button className="btn primary small" onClick={() => setComposeModal({ name: "", formKey: "", description: "" })}>
                ＋ 新建组合域
              </button>
            )}
            {canMaintain && (
              <button className="btn ghost small" onClick={() => navigate("/content-manager/aup-field")} title="维护字段字典（字段文件夹/字段）">
                🗂️ 管理字段
              </button>
            )}
          </div>
        </div>

        <div className="aup-wb-split aup-wb-split--wide-aside">
          <aside className="aup-wb-aside">
            {templatesQuery.isLoading && <div className="aup-wb-empty">加载中…</div>}
            {!templatesQuery.isLoading && groups.length === 0 && (
              <div className="aup-wb-empty">
                暂无{KIND_LABEL[tab]}
                {tab === "ATOM" && canMaintain ? "，点击右上「＋ 新建原子域」" : ""}
                {tab === "COMPOSITE" && canMaintain ? "，点击右上「＋ 新建组合域」" : ""}
              </div>
            )}
            {groups.map((versions) => {
              const head = versions[0];
              const on = selectedKey === head.formKey;
              return (
                <div
                  key={head.formKey}
                  className={`aup-wb-row${on ? " on" : ""}`}
                  style={{ paddingLeft: 10 }}
                  onClick={() => selectRow(versions)}
                  title={head.description || head.name}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lbl" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="aup-wb-chip muted">{KIND_LABEL[(head.kind as Tab) ?? "PROTOCOL"]}</span>
                      <span>{head.name}</span>
                    </div>
                    <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                      {head.formKey} · {versions.length} 版本
                    </div>
                  </div>
                  <span
                    className="aup-wb-chip"
                    style={{ background: statusMeta(head.status).bg, color: statusMeta(head.status).color }}
                  >
                    {statusMeta(head.status).text}
                  </span>
                </div>
              );
            })}
          </aside>

          <div className="aup-wb-main">
            {!selectedVersion && <div className="aup-wb-empty">选左侧模板查看版本与结构预览</div>}

            {selectedVersion && selectedGroup && (
              <div className="aup-wb-panel">
                <div className="aup-wb-panel-hd">
                  <span className="title">{selectedGroup[0].name}</span>
                  <span className="aup-wb-chip">{KIND_LABEL[(selectedGroup[0].kind as Tab) ?? "PROTOCOL"]}</span>
                  <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
                    {selectedGroup[0].formKey}
                  </span>
                  <span className="aup-wb-chip muted">v{selectedVersion.version}</span>
                  <div style={{ flex: 1 }} />
                  {renderActions(selectedVersion)}
                </div>

                {selectedGroup[0].description && (
                  <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "4px 0 8px", lineHeight: 1.5 }}>
                    {selectedGroup[0].description}
                  </div>
                )}

                {/* 版本轨：每个版本可单独切换预览 + 删除 */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "4px 0 8px" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>版本</span>
                  {selectedGroup.map((v) => {
                    const active = previewId === v.id;
                    return (
                      <span key={v.id} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setPreviewId(v.id)}
                          style={{
                            borderColor: active ? "var(--primary)" : undefined,
                            background: active ? "var(--primary-weak)" : "#fff",
                            fontWeight: active ? 700 : 500,
                          }}
                        >
                          v{v.version} · {statusMeta(v.status).text}
                        </button>
                        <button
                          type="button"
                          className="btn small danger"
                          title="删除此版本"
                          disabled={deleteMut.isPending}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (await appConfirm(`删除 v${v.version}？此操作不可恢复。`)) deleteMut.mutate(v.id);
                          }}
                        >
                          删
                        </button>
                      </span>
                    );
                  })}
                </div>

                {/* ATOM 被组合域钉住 */}
                {tab === "ATOM" && (
                  <div style={{ margin: "4px 0 8px", fontSize: 12.5 }}>
                    <span style={{ fontWeight: 700 }}>被组合域钉住（{usageRefs.length}）</span>
                    {usageQuery.isLoading && <span style={{ color: "var(--muted)", marginLeft: 8 }}>…</span>}
                    {!usageQuery.isLoading &&
                      usageRefs.map((r, i) => (
                        <span key={i} className="aup-wb-chip muted" style={{ marginLeft: 6 }}>
                          {r.compositeName || r.compositeFormKey}@v{r.compositeVersion}
                        </span>
                      ))}
                    {!usageQuery.isLoading && usageRefs.length === 0 && (
                      <span style={{ color: "var(--muted)", marginLeft: 8 }}>暂无</span>
                    )}
                  </div>
                )}

                {/* 结构预览（当前选中版本） */}
                <div style={{ fontWeight: 700, fontSize: 12.5, margin: "8px 0 6px" }}>结构预览（当前选中版本）</div>
                {detailQuery.isLoading && <div style={{ color: "var(--muted)" }}>加载结构…</div>}
                {detailQuery.isError && <div style={{ color: "var(--danger, #c2410c)" }}>结构加载失败</div>}
                {detailQuery.data && <TemplateStructurePreview sections={detailQuery.data.sections} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 新建原子域弹窗 */}
      {atomModal && (
        <div className="aup-modal-mask" onClick={() => setAtomModal(null)}>
          <div className="aup-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3>新建原子域</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              新建一个原子域，作为发布/组合的单元。字段内容到「字段域」页组织，或到编辑器里搭建。
            </p>
            {row(
              "名称",
              <input className="input" placeholder="如 动物基本信息" value={atomModal.name} onChange={(e) => setAtomModal({ ...atomModal, name: e.target.value })} />,
            )}
            {row(
              "编码",
              <input className="input" placeholder="可选，如 animalInfo（缺省用 atom:{code}）" value={atomModal.code} onChange={(e) => setAtomModal({ ...atomModal, code: e.target.value })} />,
            )}
            {row(
              "描述",
              <textarea className="textarea" rows={2} value={atomModal.description} onChange={(e) => setAtomModal({ ...atomModal, description: e.target.value })} />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setAtomModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!atomModal.name.trim() || createAtomMut.isPending}
                onClick={() =>
                  createAtomMut.mutate({
                    formKey: atomModal.formKey.trim() || undefined,
                    name: atomModal.name.trim(),
                    code: atomModal.code.trim() || undefined,
                    description: atomModal.description.trim() || undefined,
                  })
                }
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建组合域：勾选原子域 + 选版本 + 预览 */}
      {composeModal && (
        <AupCompositeComposer
          atoms={atomTemplates}
          name={composeModal.name}
          formKey={composeModal.formKey}
          onNameChange={(v) => setComposeModal({ ...composeModal, name: v })}
          onFormKeyChange={(v) => setComposeModal({ ...composeModal, formKey: v })}
          onCancel={() => setComposeModal(null)}
          confirming={composeMut.isPending}
          onConfirm={(picks) =>
            composeMut.mutate({
              formKey: composeModal.formKey.trim() || undefined,
              name: composeModal.name.trim(),
              description: composeModal.description.trim() || undefined,
              atoms: picks,
            })
          }
        />
      )}
    </div>
  );
}
