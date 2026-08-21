/**
 * NHP CRF 表单模板编辑器（对齐 AUP aup-template/edit 能力）。
 *
 * 架构：页面壳组合 SectionTree + 主区直编预览 + FieldEditorPanel 抽屉 + TypeMenu。
 * 见《数据库字段档案》12/13/15。
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { useTemplateEditor } from "../../store/useTemplateEditor";
import {
  buildFieldCatalog,
  collectAllFields,
  collectFieldKeys,
  describeShowWhen,
  findField,
  nextFieldKey,
  nextSectionCode,
  nextSubsectionNumber,
  statusLabel,
} from "../../store/editorUtils";
import { sortSectionsByDomainCode } from "../../utils/domainSort";
import { typeMetaOf } from "../../schema/typeRegistry";
import type { FieldType, FormField } from "../../schema/formTemplate";
import type { FieldTemplate } from "../../schema/fieldTemplates";
import * as templateApi from "../../api/nhpTemplate.api";
import type { NhpAtomRef } from "../../api/nhpTemplate.api";
import { fetchNhpCodelists } from "../../api/nhpCodelist.api";
import NhpFormField from "../../components/NhpFormField";
import NhpCompositeComposer, { type StagePick } from "../../components/NhpCompositeComposer";
import SectionTree from "../../editor/SectionTree";
import FieldEditorPanel from "../../editor/FieldEditorPanel";
import TypeMenu from "../../editor/TypeMenu";
import { appConfirm } from "@/lib/appDialog";
import "../../nhp.css";

export default function NhpTemplateEditor() {
  const goBack = useGoBack("/content-manager/nhp-template");
  const { formKey: formKeyParam } = useParams<{ formKey: string }>();
  const formKey = formKeyParam ?? "";

  const {
    sections,
    selectedFieldKey,
    load,
    selectField,
    selectSection,
    addSection,
    removeSection,
    updateSection,
    addSubsection,
    removeSubsection,
    addField,
    updateField,
    removeField,
    moveField,
    insertTemplate,
  } = useTemplateEditor();

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [version, setVersion] = useState<number | undefined>();
  const [kind, setKind] = useState<"ATOM" | "COMPOSITE">("COMPOSITE");
  const [atoms, setAtoms] = useState<NhpAtomRef[]>([]);
  const [atomSummary, setAtomSummary] = useState("");
  const [atomLocked, setAtomLocked] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [search, setSearch] = useState("");
  const [codelists, setCodelists] = useState<{ code: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [addMenu, setAddMenu] = useState<{ sectionCode: string; subsectionCode: string | null } | null>(null);
  /** 组合编辑器内：添加缺失数据域原子 / 更换某原子 */
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerFocus, setComposerFocus] = useState<string | null>(null);

  useEffect(() => {
    fetchNhpCodelists()
      .then((list) => setCodelists(list.map((c) => ({ code: c.code, name: c.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!formKey) return;
    setBusy(true);
    templateApi
      .fetchNhpTemplate(formKey)
      .then((t) => {
        load(sortSectionsByDomainCode(t.sections ?? []));
        setTitle(t.title ?? formKey);
        setStatus(t.status ?? "DRAFT");
        setVersion(t.version);
        setKind(t.kind === "ATOM" ? "ATOM" : "COMPOSITE");
        setAtomLocked(!!t.locked);
        const nextAtoms = t.atoms ?? [];
        setAtoms(nextAtoms);
        if (nextAtoms.length) {
          setAtomSummary(nextAtoms.map((a) => `${a.atomCode}@v${a.atomVersion ?? "?"}`).join(" · "));
        } else if (t.referencedBy?.length) {
          setAtomSummary(
            "引用：" + t.referencedBy.map((r) => `${r.formKey}@v${r.version ?? "?"}`).join(" · "),
          );
        } else {
          setAtomSummary("");
        }
      })
      .catch((e: Error) => toast.error(e.message || "加载模板失败"))
      .finally(() => setBusy(false));
  }, [formKey, load]);

  const applyTemplatePayload = (t: templateApi.NhpFormTemplate) => {
    load(sortSectionsByDomainCode(t.sections ?? []));
    setTitle(t.title ?? formKey);
    setStatus(t.status ?? "DRAFT");
    setVersion(t.version);
    setKind(t.kind === "ATOM" ? "ATOM" : "COMPOSITE");
    setAtomLocked(!!t.locked);
    const nextAtoms = t.atoms ?? [];
    setAtoms(nextAtoms);
    if (nextAtoms.length) {
      setAtomSummary(nextAtoms.map((a) => `${a.atomCode}@v${a.atomVersion ?? "?"}`).join(" · "));
    } else if (t.referencedBy?.length) {
      setAtomSummary(
        "引用：" + t.referencedBy.map((r) => `${r.formKey}@v${r.version ?? "?"}`).join(" · "),
      );
    } else {
      setAtomSummary("");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAddMenu(null);
      selectField(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectField]);

  const selectedField = useMemo(() => findField(sections, selectedFieldKey), [sections, selectedFieldKey]);
  const fieldCatalog = useMemo(() => buildFieldCatalog(sections), [sections]);
  const fieldOptions = useMemo(() => collectAllFields(sections), [sections]);
  // 原子：草稿且未被组合钉住可编辑；已发布须新建版本。组合：仅 DRAFT
  const editable =
    kind === "ATOM"
      ? !atomLocked && (status === "DRAFT" || status === "FREEZING" || !status)
      : status === "DRAFT";
  const showEditMode = editable && viewMode === "edit";
  const isPublishedStatus = status === "PUBLISHED" || status === "FROZEN";

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
    } catch (e) {
      toast.error((e as Error)?.message || "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const payload: Parameters<typeof templateApi.saveNhpTemplate>[1] = {
        formKey,
        title,
        sections,
      };
      if (kind === "COMPOSITE") {
        payload.atoms = atoms.map((a) => ({
          atomCode: a.atomCode,
          atomFormId: a.atomFormId,
          sortOrder: a.sortOrder,
        }));
      }
      const t = await templateApi.saveNhpTemplate(formKey, payload);
      applyTemplatePayload(t);
    }, "已保存");

  const generate = () =>
    run(async () => {
      const scoped = formKey.match(/^([a-z0-9_-]+)__(.+)$/i);
      const dictKey = scoped ? scoped[1].toLowerCase() : /^D+\d/i.test(formKey) ? "pig" : undefined;
      const domainOrKey = scoped ? scoped[2] : formKey;
      const t = await templateApi.generateFromDict(domainOrKey, title || formKey, dictKey);
      applyTemplatePayload(t);
    }, "已从字段字典生成");

  const publish = async () => {
    const tip =
      kind === "ATOM"
        ? "发布后该原子版本成为独立可填表单（冻结）。改结构请先「新建版本」。确认？"
        : "发布后将冻结当前组合版本。确认发布？";
    if (!await appConfirm(tip)) return;
    run(async () => {
      await templateApi.publishNhpTemplate(formKey);
      setStatus("PUBLISHED");
    }, kind === "ATOM" ? "原子已发布（可独立开填）" : "已发布冻结");
  };

  const newDraft = async () => {
    const tip =
      kind === "ATOM"
        ? "将基于当前最新版克隆新版本（版号自动补位空缺）。确认？"
        : "将基于已发布版新建草稿版本（版号自动补位空缺）。确认？";
    if (!await appConfirm(tip)) return;
    run(async () => {
      const t = await templateApi.createNhpTemplateDraft(formKey);
      applyTemplatePayload(t);
    }, kind === "ATOM" ? "已新建原子版本" : "已新建草稿版本");
  };

  const openAddStages = () => {
    setComposerFocus(null);
    setComposerOpen(true);
  };

  const openReplaceStage = (code: string) => {
    setComposerFocus(code);
    setComposerOpen(true);
  };

  const handleRemoveSection = (code: string) => {
    if (!editable) {
      toast.error(kind === "COMPOSITE" ? "已发布版本不可删章节，请先新建草稿" : "已锁定版本不可删除");
      return;
    }
    removeSection(code);
    if (kind === "COMPOSITE") {
      setAtoms((prev) => {
        const next = prev.filter((a) => a.atomCode !== code);
        setAtomSummary(next.map((a) => `${a.atomCode}@v${a.atomVersion ?? "?"}`).join(" · "));
        return next;
      });
      toast.success(`已移除数据域原子 ${code}，可重新选择`);
    }
  };

  const handleComposerConfirm = async (picks: StagePick[]) => {
    setBusy(true);
    try {
      // 更换单数据域原子：合并其余已钉住原子
      let merged = picks;
      if (composerFocus) {
        const others = atoms
          .filter((a) => a.atomCode !== composerFocus)
          .map(
            (a): StagePick => ({
              atomCode: a.atomCode,
              atomFormId: a.atomFormId,
              version: a.atomVersion,
              title: a.atomTitle,
            }),
          );
        const focusPick = picks.find((p) => p.atomCode === composerFocus);
        merged = focusPick ? [...others, focusPick] : others;
      } else if (kind === "COMPOSITE" && atoms.length) {
        // 添加缺失：保留原有 + 新勾选（同码以 picks 为准）
        const byCode = new Map<string, StagePick>();
        for (const a of atoms) {
          byCode.set(a.atomCode, {
            atomCode: a.atomCode,
            atomFormId: a.atomFormId,
            version: a.atomVersion,
            title: a.atomTitle,
          });
        }
        for (const p of picks) byCode.set(p.atomCode, p);
        merged = [...byCode.values()];
      }
      const t = await templateApi.composeNhpTemplate({
        formKey,
        title: title || formKey,
        atoms: merged.map((p) => ({ atomCode: p.atomCode, atomFormId: p.atomFormId })),
      });
      applyTemplatePayload(t);
      setComposerOpen(false);
      setComposerFocus(null);
      toast.success("已按数据域原子更新组合结构");
    } catch (e) {
      toast.error((e as Error)?.message || "组合失败");
    } finally {
      setBusy(false);
    }
  };

  const handleAddSection = () => {
    const code = nextSectionCode(sections.map((s) => s.code));
    addSection(code, "");
    selectSection(code);
  };

  const handleAddSubsection = (sectionCode: string) => {
    const sec = sections.find((s) => s.code === sectionCode);
    if (!sec) return;
    const n = nextSubsectionNumber((sec.subsections ?? []).map((u) => u.code), sectionCode);
    const code = `${sectionCode}.${String(n).padStart(2, "0")}`;
    addSubsection(sectionCode, code, "");
  };

  const handleRemoveSubsection = async (sectionCode: string, subsectionCode: string) => {
    const sec = sections.find((s) => s.code === sectionCode);
    const sub = sec?.subsections?.find((u) => u.code === subsectionCode);
    if (!sub) return;
    const n = sub.fields?.length ?? 0;
    const tip =
      n > 0
        ? `删除子模块「${sub.label || subsectionCode}」？其下 ${n} 道题目将一并删除。`
        : `删除子模块「${sub.label || subsectionCode}」？`;
    if (!await appConfirm(tip)) return;
    removeSubsection(sectionCode, subsectionCode);
    setAddMenu((m) =>
      m?.sectionCode === sectionCode && m.subsectionCode === subsectionCode ? null : m,
    );
  };

  const handlePickType = (type: FieldType) => {
    if (!addMenu) return;
    const sec = sections.find((s) => s.code === addMenu.sectionCode);
    if (!sec) return;
    const parentCode =
      addMenu.subsectionCode ??
      addMenu.sectionCode;
    const key = nextFieldKey(parentCode, collectFieldKeys(sec));
    const meta = typeMetaOf(type);
    const nf: FormField = {
      fieldKey: key,
      label: "",
      type,
      required: false,
      config: meta?.defaultConfig ? { ...meta.defaultConfig } : undefined,
    };
    addField(addMenu.sectionCode, addMenu.subsectionCode, nf);
    selectField(key);
    setAddMenu(null);
  };

  const handlePickTemplate = (tpl: FieldTemplate) => {
    if (!addMenu) return;
    const sec = sections.find((s) => s.code === addMenu.sectionCode);
    if (!sec) return;
    const parentCode = addMenu.subsectionCode ?? addMenu.sectionCode;
    const base = nextFieldKey(parentCode, collectFieldKeys(sec));
    insertTemplate(addMenu.sectionCode, addMenu.subsectionCode, tpl.build(base));
    setAddMenu(null);
  };

  const scrollToSection = (code: string) =>
    setTimeout(() => document.getElementById(`nhp-section-${code}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);

  return (
    <div className="aup aup--editor nhp-template-editor">
      <div className="aup-topbar">
        <button type="button" className="aup-btn ghost" onClick={goBack}>
          ← 返回
        </button>
        <input
          className="aup-input aup-top-name"
          value={title}
          disabled={!editable}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="模板标题"
        />
        <span className={`aup-tag ${editable ? "draft" : "published"}`}>
          {kind === "ATOM" ? "原子" : "组合"} ·{" "}
          {kind === "ATOM"
            ? atomLocked
              ? "已锁定"
              : isPublishedStatus
                ? statusLabel(status)
                : "可编辑"
            : statusLabel(status)}
          {version != null ? ` · v${version}` : ""}
        </span>
        <span className="aup-muted">{formKey}</span>
        {atomSummary && (
          <span className="aup-muted" title={atomSummary} style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}>
            {kind === "ATOM" ? atomSummary : `钉：${atomSummary}`}
          </span>
        )}
        <div className="aup-spacer" />
        {editable && (
          <div className="aup-mode-toggle">
            <button type="button" className={viewMode === "edit" ? "active" : ""} onClick={() => setViewMode("edit")}>
              编辑
            </button>
            <button type="button" className={viewMode === "preview" ? "active" : ""} onClick={() => setViewMode("preview")}>
              预览
            </button>
          </div>
        )}
        {kind === "ATOM" && editable && (
          <button type="button" className="aup-btn ghost" disabled={busy || !formKey} onClick={generate}>
            从字典生成
          </button>
        )}
        <button type="button" className="aup-btn primary" disabled={busy || !formKey || !editable} onClick={save}>
          保存
        </button>
        {editable && (
          <button type="button" className="aup-btn" disabled={busy || !formKey} onClick={publish}>
            {kind === "ATOM" ? "发布为独立表单" : "发布"}
          </button>
        )}
        {(kind === "ATOM" || !editable) && (
          <button type="button" className="aup-btn" disabled={busy || !formKey} onClick={newDraft}>
            {kind === "ATOM" ? "新建版本" : "新建草稿版本"}
          </button>
        )}
      </div>

      {kind === "COMPOSITE" && editable && (
        <div className="nhp-editor-stage-bar">
          <span className="aup-muted" style={{ fontWeight: 600 }}>
            数据域原子
          </span>
          {atoms.length === 0 ? (
            <span className="aup-muted">尚未钉住原子 — 删除章节后或点右侧添加</span>
          ) : (
            atoms.map((a) => (
              <span key={a.atomCode} className="nhp-editor-stage-chip">
                <span className="code">{a.atomCode}</span>
                <span>v{a.atomVersion ?? "?"}</span>
                <button
                  type="button"
                  className="aup-btn small ghost"
                  style={{ padding: "0 4px", fontSize: 11 }}
                  onClick={() => openReplaceStage(a.atomCode)}
                  title="更换该数据域原子版本"
                >
                  更换
                </button>
              </span>
            ))
          )}
          <button type="button" className="aup-btn small ghost" disabled={busy} onClick={openAddStages}>
            ＋ 添加数据域原子
          </button>
          <span className="aup-muted" style={{ marginLeft: "auto" }}>
            删除左侧章节后可重新选择同数据域；同域不可重复添加
          </span>
        </div>
      )}

      <div className="aup-split">
        <aside className="aup-toc nhp-editor-toc">
          <div className="hd">
            <span>CRF 目录</span>
          </div>
          <div className="search">
            <input
              className="aup-input"
              placeholder="搜索题目…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="body nhp-editor-toc-body">
            <SectionTree
              sections={sections}
              selectedFieldKey={selectedFieldKey}
              search={search}
              embedded
              onSelectField={(k) => {
                selectField(k);
                const sec = sections.find((s) => collectFieldKeys(s).includes(k));
                if (sec) scrollToSection(sec.code);
              }}
              onSelectSection={(code) => {
                selectSection(code);
                scrollToSection(code);
              }}
              onAddSection={editable ? handleAddSection : () => {}}
              onRemoveSection={editable ? handleRemoveSection : () => {}}
              onRemoveSubsection={editable ? handleRemoveSubsection : undefined}
            />
          </div>
        </aside>

        <main className="aup-main">
          {!showEditMode && (
            <div className="aup-preview-hint">预览模式：所见即填写人视图（条件字段按规则隐藏，此处不模拟取值）。</div>
          )}

          {sections.length === 0 ? (
            <div className="aup-empty-hero">
              <div className="ic">🧫</div>
              <div className="t">尚无 CRF 板块</div>
              <div className="d">
                {kind === "COMPOSITE"
                  ? "可「添加数据域原子」按域→版本→预览组合；删除章节后也可重新选择该域。"
                  : "原子不可随意覆盖：请用「新建版本」后再改。也可从字段字典按域生成结构。"}
              </div>
              <div className="acts">
                {kind === "COMPOSITE" ? (
                  <button type="button" className="aup-btn primary" disabled={busy} onClick={openAddStages}>
                    ＋ 添加数据域原子
                  </button>
                ) : (
                  <button type="button" className="aup-btn primary" disabled={busy || !editable} onClick={generate}>
                    从字典生成
                  </button>
                )}
                {kind === "ATOM" && editable && (
                  <button type="button" className="aup-btn ghost" onClick={handleAddSection}>
                    ＋ 新增数据域
                  </button>
                )}
              </div>
            </div>
          ) : (
            sections.map((sec) => (
              <section key={sec.code} id={`nhp-section-${sec.code}`} className="aup-ed-card">
                <div className="aup-sec-hd">
                  <span className="aup-code-badge">{sec.code}</span>
                  {showEditMode ? (
                    <input
                      className="aup-input"
                      style={{ flex: 1, fontWeight: 700 }}
                      value={sec.label}
                      placeholder="数据域名称"
                      onChange={(e) => updateSection(sec.code, { label: e.target.value })}
                    />
                  ) : (
                    <span className="aup-sec-title">{sec.label || sec.code}</span>
                  )}
                  {showEditMode && (
                    <div className="aup-sec-acts">
                      <button type="button" className="aup-btn small ghost" onClick={() => handleAddSubsection(sec.code)}>
                        ＋ 子模块
                      </button>
                      <button
                        type="button"
                        className="aup-btn small ghost"
                        onClick={() => setAddMenu({ sectionCode: sec.code, subsectionCode: null })}
                      >
                        ＋ 题目
                      </button>
                    </div>
                  )}
                </div>

                {(sec.subsections ?? []).map((sub) => (
                  <div key={sub.code}>
                    <div className="aup-sub-hd">
                      <span className="aup-sub-code">{sub.code}</span>
                      <span>{sub.label || "子模块"}</span>
                      {showEditMode && (
                        <span className="aup-spacer" style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                          <button
                            type="button"
                            className="aup-add-link"
                            onClick={() => setAddMenu({ sectionCode: sec.code, subsectionCode: sub.code })}
                          >
                            ＋ 添加题目
                          </button>
                          <button
                            type="button"
                            className="aup-iconbtn danger"
                            title="删除子模块"
                            onClick={() => handleRemoveSubsection(sec.code, sub.code)}
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </div>
                    {sub.fields.map((f, fi) => (
                      <FieldPreview
                        key={f.fieldKey}
                        field={f}
                        showEdit={showEditMode}
                        conditionText={f.showWhen ? describeShowWhen(f.showWhen, fieldOptions) : ""}
                        onEdit={() => selectField(f.fieldKey)}
                        onMove={(dir) => moveField(f.fieldKey, dir)}
                        onRemove={() => removeField(f.fieldKey)}
                        isFirst={fi === 0}
                        isLast={fi === sub.fields.length - 1}
                      />
                    ))}
                  </div>
                ))}

                {(sec.fields ?? []).map((f, fi) => (
                  <FieldPreview
                    key={f.fieldKey}
                    field={f}
                    showEdit={showEditMode}
                    conditionText={f.showWhen ? describeShowWhen(f.showWhen, fieldOptions) : ""}
                    onEdit={() => selectField(f.fieldKey)}
                    onMove={(dir) => moveField(f.fieldKey, dir)}
                    onRemove={() => removeField(f.fieldKey)}
                    isFirst={fi === 0}
                    isLast={fi === (sec.fields ?? []).length - 1}
                  />
                ))}

                {showEditMode && (
                  <div className="aup-add-row">
                    <button
                      type="button"
                      className="aup-add-link"
                      onClick={() => setAddMenu({ sectionCode: sec.code, subsectionCode: null })}
                    >
                      ＋ 添加题目
                    </button>
                  </div>
                )}
              </section>
            ))
          )}
        </main>
      </div>

      {addMenu && <TypeMenu onPick={handlePickType} onPickTemplate={handlePickTemplate} onClose={() => setAddMenu(null)} />}

      {composerOpen && kind === "COMPOSITE" && (
        <div className="nhp-editor-composer-mask" onClick={() => !busy && setComposerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <NhpCompositeComposer
              mode="edit"
              hideMeta
              formKey={formKey}
              title={title}
              initialPicks={atoms.map((a) => ({
                atomCode: a.atomCode,
                atomFormId: a.atomFormId,
                version: a.atomVersion,
                title: a.atomTitle,
              }))}
              occupiedCodes={atoms.map((a) => a.atomCode)}
              allowReplaceCodes={composerFocus ? [composerFocus] : []}
              focusStage={composerFocus}
              confirming={busy}
              confirmLabel={composerFocus ? `更换 ${composerFocus} 并刷新` : "应用并刷新结构"}
              onCancel={() => {
                setComposerOpen(false);
                setComposerFocus(null);
              }}
              onConfirm={(picks) => void handleComposerConfirm(picks)}
            />
          </div>
        </div>
      )}

      {selectedField && showEditMode && (
        <div className="aup-drawer-mask" onClick={() => selectField(null)}>
          <FieldEditorPanel
            field={selectedField}
            fieldCatalog={fieldCatalog}
            codelists={codelists}
            editable={editable}
            onChange={(patch) => updateField(selectedField.fieldKey, patch)}
            onRemove={async () => {
              if (await appConfirm("删除该题目？")) removeField(selectedField.fieldKey);
            }}
            onClose={() => selectField(null)}
          />
        </div>
      )}
    </div>
  );
}

function FieldPreview({
  field,
  showEdit,
  conditionText,
  onEdit,
  onMove,
  onRemove,
  isFirst,
  isLast,
}: {
  field: FormField;
  showEdit: boolean;
  conditionText: string;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="aup-fw">
      <div className="nhp-field-wrap" style={{ padding: "4px 0" }}>
        <label>
          {field.label || "（未命名）"}
          {field.required ? <span className="req"> *</span> : null}
          {field.config?.unit ? <span className="unit">（{field.config.unit}）</span> : null}
          <span className="aup-muted" style={{ marginLeft: 8, fontWeight: 400 }}>
            {typeMetaOf(field.type)?.label ?? field.type}
            {field.dictKey ? ` · ${field.dictKey}` : ""}
          </span>
        </label>
        <NhpFormField field={field} value={undefined} onChange={() => {}} />
        {field.description ? <div className="hint">{field.description}</div> : null}
      </div>
      {conditionText ? (
        <button type="button" className="aup-cond-banner small action" onClick={onEdit}>
          {conditionText}
        </button>
      ) : null}
      {showEdit && (
        <span className="aup-fw-acts">
          <button type="button" className="aup-btn small ghost" onClick={onEdit}>
            ✎ 编辑
          </button>
          <button type="button" className="aup-iconbtn" disabled={isFirst} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button type="button" className="aup-iconbtn" disabled={isLast} onClick={() => onMove(1)}>
            ↓
          </button>
          <button type="button" className="aup-iconbtn danger" onClick={onRemove}>
            ×
          </button>
        </span>
      )}
    </div>
  );
}
