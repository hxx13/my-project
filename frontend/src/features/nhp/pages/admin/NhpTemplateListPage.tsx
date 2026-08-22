/**
 * NHP 模板发布：已发布组合 / 原子模板列表 + 版本预览。
 * 字段字典为父源（/#/content-manager/nhp-field）；本页仅管理呈现层发布与版本。
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  createNhpCompositeDraft,
  createNhpTemplateDraft,
  deleteNhpTemplateAllVersions,
  deleteNhpTemplateVersion,
  fetchNhpTemplateById,
  fetchNhpTemplateVersions,
  fetchNhpTemplates,
  formatBuiltinSeedImportToast,
  importNhpBuiltinSeedTemplates,
  publishNhpTemplate,
  unfreezeNhpTemplate,
  versionOriginLabel,
  isFillablePublished,
  type NhpAtomReferencedBy,
  type NhpTemplateListItem,
} from "../../api/nhpTemplate.api";
import NhpTemplateStructurePreview from "../../components/NhpTemplateStructurePreview";
import { AtomPickList, buildDomainNameMap } from "../../utils/nhpAtomDisplay";
import { fetchNhpDictStructure } from "../../api/nhpFieldDictionary.api";
import { statusLabel } from "../../store/editorUtils";
import { nhpNavState } from "../../utils/nhpAdminNav";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import { appConfirm } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "../../nhp.css";

type PublishFilter = "PUBLISHED" | "ALL";

function templateKind(t: NhpTemplateListItem): "COMPOSITE" | "ATOM" {
  const ft = (t.formType || "").toUpperCase();
  const kd = (t.kind || "").toUpperCase();
  return ft === "TEMPLATE" || kd === "COMPOSITE" ? "COMPOSITE" : "ATOM";
}

function isPublished(s: string): boolean {
  const u = (s || "").toUpperCase();
  return u === "PUBLISHED" || u === "FROZEN";
}

function itemKindLabel(t: NhpTemplateListItem): string {
  return templateKind(t) === "COMPOSITE" ? "组合模板" : "原子模板";
}

function suiteBadgeLabel(dictKey?: string | null): string {
  const k = (dictKey || "").trim() || "pig";
  if (k === "pig") return "猪字典";
  if (k === "monkey") return "猴字典";
  if (k === "mixed") return "跨套";
  return k;
}

function suiteBadgeClass(dictKey?: string | null): string {
  const k = (dictKey || "").trim() || "pig";
  if (k === "monkey") return "nhp-suite-chip nhp-suite-chip--monkey";
  if (k === "mixed") return "nhp-suite-chip nhp-suite-chip--mixed";
  if (k === "pig") return "nhp-suite-chip nhp-suite-chip--pig";
  return "nhp-suite-chip";
}

function atomListMetaKey(t: NhpTemplateListItem): string {
  const dk = (t.dictKey || "").trim() || "pig";
  const dc = (t.domainCode || "").trim();
  const barePig = dk === "pig" && !t.formKey.includes("__");
  if (barePig) return t.formKey;
  if (dc) return `${dk} · ${dc}`;
  return t.formKey;
}

function formatPinRefs(refs: NhpAtomReferencedBy[] | undefined): string {
  if (!refs?.length) return "";
  return refs
    .map((r) => {
      const ol = versionOriginLabel(r.origin);
      return `${r.formKey}@v${r.version ?? "?"}${ol ? `（${ol}）` : ""}`;
    })
    .join("、");
}

function editPath(formKey: string): string {
  return `/content-manager/nhp-template/edit/${encodeURIComponent(formKey)}`;
}

const PUBLISH_FILTERS: { value: PublishFilter; label: string }[] = [
  { value: "PUBLISHED", label: "已发布" },
  { value: "ALL", label: "含草稿" },
];

export default function NhpTemplateListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack("/content-manager/nhp-template");
  const qc = useQueryClient();
  const [publishFilter, setPublishFilter] = useState<PublishFilter>("PUBLISHED");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [previewFormId, setPreviewFormId] = useState<number | null>(null);

  const listQuery = useQuery({
    queryKey: ["nhp", "templates", "ALL"],
    queryFn: () => fetchNhpTemplates("ALL"),
  });

  const versionsQuery = useQuery({
    queryKey: ["nhp", "templates", "versions", selectedKey],
    queryFn: () => fetchNhpTemplateVersions(selectedKey!),
    enabled: !!selectedKey,
  });

  const previewQuery = useQuery({
    queryKey: ["nhp", "templates", "by-id", previewFormId],
    queryFn: () => fetchNhpTemplateById(previewFormId!),
    enabled: !!previewFormId,
  });

  const templates = useMemo(() => {
    const byKey = new Map<string, NhpTemplateListItem>();
    for (const t of listQuery.data ?? []) {
      if (publishFilter === "PUBLISHED" && !isFillablePublished(t)) continue;
      byKey.set(t.formKey, t);
    }
    return [...byKey.values()].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [listQuery.data, publishFilter]);

  const versions = useMemo(() => {
    const rows = [...(versionsQuery.data ?? [])];
    rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    return rows;
  }, [versionsQuery.data]);

  const selected = useMemo(() => {
    const hit = templates.find((t) => t.formKey === selectedKey) ?? null;
    if (hit) return hit;
    if (selectedKey && versions[0]?.formKey === selectedKey) return versions[0];
    return null;
  }, [templates, selectedKey, versions]);

  const selectedKind = selected ? templateKind(selected) : null;

  const selectedDictKey = (selected?.dictKey || "pig").trim() || "pig";
  const structureQuery = useQuery({
    queryKey: ["nhp", "dict-structure", selectedDictKey],
    queryFn: () => fetchNhpDictStructure(selectedDictKey),
    enabled: selectedKind === "COMPOSITE" && (selected?.atoms?.length ?? 0) > 0,
  });
  const domainNameMap = useMemo(
    () => buildDomainNameMap(structureQuery.data?.domains),
    [structureQuery.data],
  );

  const openCompositeInList = (formKey: string, formId?: number) => {
    setPublishFilter("ALL");
    setSelectedKey(formKey);
    if (formId != null) setPreviewFormId(formId);
  };

  useEffect(() => {
    if (!templates.length) {
      setSelectedKey(null);
      setPreviewFormId(null);
      return;
    }
    const still = selectedKey && templates.some((t) => t.formKey === selectedKey);
    const nextKey = still ? selectedKey! : templates[0].formKey;
    if (nextKey !== selectedKey) setSelectedKey(nextKey);
  }, [templates, selectedKey]);

  useEffect(() => {
    if (!selectedKey) {
      setPreviewFormId(null);
      return;
    }
    if (versionsQuery.isLoading) return;
    if (versions.length) {
      const head = versions[0];
      setPreviewFormId((prev) => {
        if (prev && versions.some((v) => v.formId === prev)) return prev;
        return head.formId;
      });
    } else if (selected?.formId) {
      setPreviewFormId(selected.formId);
    }
  }, [selectedKey, versions, versionsQuery.isLoading, selected?.formId]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
    void qc.invalidateQueries({ queryKey: ["nhp", "assignable-templates"] });
  };

  const importSeedMutation = useMutation({
    mutationFn: () => importNhpBuiltinSeedTemplates(),
    onSuccess: (r) => {
      toast.success(formatBuiltinSeedImportToast(r), { duration: 9000 });
      setPublishFilter("ALL");
      invalidate();
      void qc.invalidateQueries({ queryKey: ["nhp", "field-dictionaries"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "fields"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "field-structure"] });
    },
    onError: (e: Error) => toast.error(e.message || "导入失败", { duration: 9000 }),
  });

  const createBlankCompositeMutation = useMutation({
    mutationFn: () => createNhpCompositeDraft(),
    onSuccess: (t) => {
      toast.success("已创建空白组合草稿，请在编辑器中钉住原子或搭建章节");
      invalidate();
      navigate(editPath(t.formKey), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "创建组合草稿失败"),
  });

  const publishMutation = useMutation({
    mutationFn: (formKey: string) => publishNhpTemplate(formKey),
    onSuccess: () => {
      toast.success("已发布（冻结）");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  const unfreezeMutation = useMutation({
    mutationFn: (formKey: string) => unfreezeNhpTemplate(formKey),
    onSuccess: (t) => {
      toast.success(`已解冻「${t.formKey}」@v${t.version ?? ""} 为草稿`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败", { duration: 9000 }),
  });

  const draftMutation = useMutation({
    mutationFn: (formKey: string) => createNhpTemplateDraft(formKey),
    onSuccess: (t) => {
      toast.success(`已新建版本 v${t.version ?? ""}，请修改后保存`);
      invalidate();
      navigate(editPath(t.formKey), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "新建版本失败"),
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (formId: number) => deleteNhpTemplateVersion(formId),
    onSuccess: (d) => {
      toast.success(`已删除 v${d.version ?? ""}`);
      setPreviewFormId(null);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["nhp", "templates", "versions"] });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const deleteAllMutation = useMutation({
    mutationFn: (formKey: string) => deleteNhpTemplateAllVersions(formKey),
    onSuccess: (d, formKey) => {
      const blocked = d.blocked?.length ? `；未删：${d.blocked.join("；")}` : "";
      toast.success(`「${formKey}」已删 ${d.deletedCount} 个版本${blocked}`);
      setSelectedKey(null);
      setPreviewFormId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const selectRow = (t: NhpTemplateListItem) => {
    setSelectedKey(t.formKey);
    setPreviewFormId(t.formId);
  };

  const previewOrigin = previewQuery.data?.origin ?? versions.find((v) => v.formId === previewFormId)?.origin;
  const previewVersion = previewQuery.data?.version ?? versions.find((v) => v.formId === previewFormId)?.version;

  return (
    <div className="aup-app aup-app--workbench nhp-template-admin">
      <div className="aup-wb">
        <div className="nhp-template-top-panel">
          <button type="button" className="btn ghost small" onClick={goBack}>
            ← 返回
          </button>

          <div className="nhp-template-tabs" role="tablist" aria-label="发布状态">
            {PUBLISH_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                className={`nhp-template-tab${publishFilter === f.value ? " on" : ""}`}
                onClick={() => {
                  setPublishFilter(f.value);
                  setSelectedKey(null);
                  setPreviewFormId(null);
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="aup-wb-count">共 {templates.length} 个</span>

          <div className="nhp-template-toolbar-actions">
            <button
              type="button"
              className="btn primary small"
              disabled={importSeedMutation.isPending}
              onClick={async () => {
                if (
                  await appConfirm(
                    "【一键导入内置种子】将同步猪字典字段（冻结 + 重建大纲），导入 45 个 DRAFT 域原子模板（含题目）。\n\n" +
                      "已有字段/原子幂等更新，不是失败。导入不会生成组合模板；原子为 DRAFT 需手动发布。导入后请在「含草稿」中查看并发布各原子。继续？",
                  )
                ) {
                  importSeedMutation.mutate();
                }
              }}
              title="POST /nhp/seed/pig-dictionary + /nhp/seed/atoms"
            >
              {importSeedMutation.isPending ? "导入中…" : "导入内置种子"}
            </button>
            <button
              type="button"
              className="btn primary small"
              disabled={createBlankCompositeMutation.isPending}
              onClick={() => createBlankCompositeMutation.mutate()}
            >
              {createBlankCompositeMutation.isPending ? "创建中…" : "＋ 去发布"}
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => navigate("/content-manager/nhp-field", { state: nhpNavState(location) })}
              title="维护字段字典（域/子模块/字段）"
            >
              🗂️ 管理字段
            </button>
          </div>
        </div>

        <div className="aup-wb-split aup-wb-split--wide-aside nhp-template-split">
          <aside className="aup-wb-aside">
            {listQuery.isLoading && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载中…</div>
            )}
            {!listQuery.isLoading && templates.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
                {publishFilter === "PUBLISHED"
                  ? "暂无已发布模板。可点「导入内置种子」后在「含草稿」中编辑并发布原子，或用「＋ 去发布」新建。"
                  : "暂无模板。点「导入内置种子」一键恢复字段包 + 45 个草稿原子模板，或用「＋ 去发布」新建。"}
              </div>
            )}
            {templates.map((t) => {
              const origin = versionOriginLabel(t.origin);
              const on = selectedKey === t.formKey;
              const k = templateKind(t);
              const metaKey = k === "ATOM" ? atomListMetaKey(t) : t.formKey;
              const rowSuite = (t.dictKey || "").trim() || "pig";
              return (
                <div
                  key={`${t.formKey}-${t.formId}`}
                  className={`aup-wb-row${on ? " on" : ""}`}
                  style={{ paddingLeft: 14 }}
                  onClick={() => selectRow(t)}
                  title={t.description || t.title}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lbl" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span className={suiteBadgeClass(rowSuite)}>{suiteBadgeLabel(rowSuite)}</span>
                      <span className="nhp-kind-chip">{itemKindLabel(t)}</span>
                      <span>{t.title || t.formKey}</span>
                    </div>
                    <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                      {metaKey} · v{t.version ?? "—"}
                      {origin ? ` · ${origin}` : ""}
                      {k === "COMPOSITE" && (t.atoms?.length ?? t.atomCount)
                        ? ` · ${t.atoms?.length ?? t.atomCount} 原子`
                        : ""}
                      {t.hasPublished && !isPublished(t.status)
                        ? ` · 已发布 v${t.publishedVersion ?? "?"}`
                        : ""}
                    </div>
                  </div>
                  {k === "COMPOSITE" ? (
                    <span className="aup-wb-chip muted">
                      {statusLabel(t.status)}
                      {t.hasPublished && !isPublished(t.status) ? "·有发布" : ""}
                    </span>
                  ) : t.locked ? (
                    <span className="aup-wb-chip muted">已锁定</span>
                  ) : isPublished(t.status) ? (
                    <span className="aup-wb-chip" style={{ background: "#e8f7ee", color: "#16a34a" }}>
                      已发布
                    </span>
                  ) : t.hasPublished ? (
                    <span className="aup-wb-chip muted">草稿·有发布</span>
                  ) : (
                    <span className="aup-wb-chip" style={{ background: "#eef2ff", color: "#002FA7" }}>
                      草稿
                    </span>
                  )}
                </div>
              );
            })}
          </aside>

          <div className="aup-wb-main">
            {!selected && <div className="aup-wb-empty">选左侧模板查看版本与结构预览</div>}

            {selected && selectedKind && (
              <div className="aup-wb-panel nhp-template-detail">
                <div className="aup-wb-panel-hd">
                  <span className="title">{selected.title || selected.formKey}</span>
                  <span className="aup-wb-chip">{itemKindLabel(selected)}</span>
                  <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
                    {selectedKind === "ATOM" ? atomListMetaKey(selected) : selected.formKey}
                  </span>
                  {previewVersion != null && (
                    <span className="aup-wb-chip muted">预览 v{previewVersion}</span>
                  )}
                  {versionOriginLabel(previewOrigin) && (
                    <span className="aup-wb-chip" style={{ background: "#fff7ed", color: "#c2410c" }}>
                      {versionOriginLabel(previewOrigin)}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => navigate(editPath(selected.formKey), { state: nhpNavState(location) })}
                  >
                    {selectedKind === "ATOM" || selected.status === "DRAFT" ? "编辑 ▸" : "查看 ▸"}
                  </button>
                  {selectedKind === "ATOM" && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={draftMutation.isPending}
                      onClick={async () => {
                        if (
                          await appConfirm(
                            "基于当前最新版克隆新版本（版号自动补位空缺；原子请通过版本演进，勿覆盖已钉住/已发布版本）。确认？",
                          )
                        ) {
                          draftMutation.mutate(selected.formKey);
                        }
                      }}
                    >
                      新建版本
                    </button>
                  )}
                  {selectedKind === "ATOM" && selected.status === "DRAFT" && !selected.locked && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={publishMutation.isPending}
                      onClick={async () => {
                        if (await appConfirm("发布后该原子成为独立可填表单（冻结）。确认？")) {
                          publishMutation.mutate(selected.formKey);
                        }
                      }}
                    >
                      发布为独立表单
                    </button>
                  )}
                  {selectedKind === "COMPOSITE" && selected.status === "DRAFT" && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={publishMutation.isPending}
                      onClick={async () => {
                        if (await appConfirm("发布后冻结该组合版本。确认？")) {
                          publishMutation.mutate(selected.formKey);
                        }
                      }}
                    >
                      发布
                    </button>
                  )}
                  {(isPublished(selected.status) || selected.hasPublished) && (
                    <>
                      <button
                        type="button"
                        className="btn small primary"
                        onClick={() =>
                          navigate(`/nhp/fill?formKey=${encodeURIComponent(selected.formKey)}`)
                        }
                      >
                        去门户建实例
                      </button>
                      {isPublished(selected.status) && (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={unfreezeMutation.isPending}
                          title="无活跃填写实例（软删不计）；原子另须无组合钉住"
                          onClick={async () => {
                            if (
                              await appConfirm(
                                `解冻「${selected.formKey}」当前已发布版为草稿？仅当无活跃填写实例${
                                  selectedKind === "ATOM" ? "且无组合钉住" : ""
                                }时允许。确认？`,
                              )
                            ) {
                              unfreezeMutation.mutate(selected.formKey);
                            }
                          }}
                        >
                          解冻
                        </button>
                      )}
                      {selectedKind === "COMPOSITE" && isPublished(selected.status) && (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={draftMutation.isPending}
                          onClick={() => draftMutation.mutate(selected.formKey)}
                        >
                          新建草稿版本
                        </button>
                      )}
                    </>
                  )}
                </div>

                <p className="nhp-template-detail-hint">
                  {selectedKind === "ATOM"
                    ? "预览仅含该域章节。列表头可能是草稿——若有「已发布 vN」徽标仍可开填。字段维护请用右上角「管理字段」。"
                    : "组合版本是多原子快照。列表头若是草稿但下方有已发布版，开填请用已发布版。"}
                </p>

                <div className="nhp-template-ver-row">
                  <span className="nhp-template-ver-label">本{selectedKind === "ATOM" ? "原子" : "组合"}版本</span>
                  {versionsQuery.isLoading ? (
                    <span className="muted">加载版本…</span>
                  ) : versions.length === 0 ? (
                    <span className="nhp-ver-chip-wrap">
                      <button
                        type="button"
                        className={`nhp-ver-chip${previewFormId === selected.formId ? " active" : ""}`}
                        onClick={() => setPreviewFormId(selected.formId)}
                      >
                        v{selected.version ?? 1}
                        {versionOriginLabel(selected.origin) ? ` · ${versionOriginLabel(selected.origin)}` : ""}
                      </button>
                    </span>
                  ) : (
                    versions.map((v) => {
                      const ol = versionOriginLabel(v.origin);
                      return (
                        <span key={v.formId} className="nhp-ver-chip-wrap">
                          <button
                            type="button"
                            className={`nhp-ver-chip${previewFormId === v.formId ? " active" : ""}`}
                            onClick={() => setPreviewFormId(v.formId)}
                            title={v.description || statusLabel(v.status)}
                          >
                            v{v.version ?? "?"}
                            {ol ? ` · ${ol}` : ""}
                            {` · ${statusLabel(v.status)}`}
                            {selectedKind === "ATOM" && v.locked ? " · 钉住" : ""}
                          </button>
                          <button
                            type="button"
                            className="nhp-ver-del"
                            title="删除此版本"
                            disabled={deleteVersionMutation.isPending}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (
                                await appConfirm(
                                  `软删 v${v.version ?? "?"}？若有填写实例引用或原子被组合钉住将拒绝并提示原因。`,
                                )
                              ) {
                                deleteVersionMutation.mutate(v.formId);
                              }
                            }}
                          >
                            删
                          </button>
                        </span>
                      );
                    })
                  )}
                  <button
                    type="button"
                    className="btn small ghost"
                    style={{ marginLeft: 8 }}
                    disabled={deleteAllMutation.isPending || !selected.formKey}
                    onClick={async () => {
                      if (
                        await appConfirm(
                          `软删「${selected.formKey}」下全部活跃版本？被填写实例引用或被组合钉住的版本会跳过并说明原因。`,
                        )
                      ) {
                        deleteAllMutation.mutate(selected.formKey);
                      }
                    }}
                  >
                    {deleteAllMutation.isPending ? "删除中…" : "清理全部版本"}
                  </button>
                </div>

                {selectedKind === "COMPOSITE" && (selected.atoms?.length ?? 0) > 0 && (
                  <div className="nhp-template-atoms-line">
                    钉住原子：
                    <AtomPickList
                      picks={(selected.atoms ?? []).map((a) => ({
                        atomCode: a.atomCode,
                        version: a.atomVersion,
                        title: a.atomTitle,
                      }))}
                      nameMap={domainNameMap}
                    />
                  </div>
                )}

                {selectedKind === "ATOM" &&
                  (() => {
                    const pinSrc =
                      (previewQuery.data?.referencedBy?.length
                        ? previewQuery.data.referencedBy
                        : null) ||
                      versions.find((v) => v.formId === previewFormId)?.referencedBy ||
                      selected.referencedBy;
                    if (!pinSrc?.length) return null;
                    return (
                      <div
                        className="nhp-template-atoms-line"
                        style={{ color: "#9a3412", background: "#fff7ed", padding: "8px 10px", borderRadius: 6 }}
                      >
                        当前版本被组合钉住：{formatPinRefs(pinSrc)}。
                        {pinSrc.map((r) => (
                          <button
                            key={`${r.formKey}-${r.compositeFormId}`}
                            type="button"
                            className="btn small ghost"
                            style={{ marginLeft: 6 }}
                            onClick={() => openCompositeInList(r.formKey, r.compositeFormId)}
                          >
                            打开 {r.formKey}@v{r.version ?? "?"}
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                <div className="nhp-template-preview-box">
                  <div className="nhp-composer-preview-hd">结构预览（当前选中版本）</div>
                  <div className="nhp-composer-preview-body">
                    {!previewFormId ? (
                      <div className="aup-empty small">请选择版本</div>
                    ) : previewQuery.isLoading ? (
                      <div className="aup-empty small">加载预览…</div>
                    ) : previewQuery.isError ? (
                      <div className="aup-empty small">预览加载失败</div>
                    ) : (
                      <NhpTemplateStructurePreview
                        template={previewQuery.data}
                        emptyHint="该版本无结构"
                      />
                    )}
                  </div>
                </div>

                {selected.updatedAt && (
                  <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    更新 {formatDateTimeAsiaShanghaiShort(selected.updatedAt)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
