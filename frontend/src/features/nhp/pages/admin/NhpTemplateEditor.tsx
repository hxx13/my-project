/**
 * NHP CRF 表单模板编辑器（对齐 AUP aup-template/edit 能力）。
 *
 * 架构：页面壳组合 SectionTree + 主区直编预览 + FieldEditorPanel 抽屉 + TypeMenu。
 * 见《数据库字段档案》12/13/15。
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { fetchNhpCodelists, fetchNhpCodelist, fetchNhpCodelistById, type NhpCodelistItem } from "../../api/nhpCodelist.api";
import { fetchNhpDictStructure } from "../../api/nhpFieldDictionary.api";
import NhpFormField from "../../components/NhpFormField";
import NhpCompositeComposer, { type StagePick } from "../../components/NhpCompositeComposer";
import { AtomPickInline, buildDomainNameMap, formatAtomPicksText } from "../../utils/nhpAtomDisplay";
import SectionTree from "../../editor/SectionTree";
import FieldEditorPanel from "../../editor/FieldEditorPanel";
import TypeMenu from "../../editor/TypeMenu";
import FieldPicker from "../../editor/FieldPicker";
import DictDomainGenerateDialog from "../../editor/DictDomainGenerateDialog";
import type { NhpField } from "../../api/nhpField.api";
import { appConfirm } from "@/lib/appDialog";
import "../../nhp.css";

function parseAtomScope(formKey: string): { dictKey: string; domainCode: string | null } {
  const scoped = formKey.match(/^([a-z0-9_-]+)__(.+)$/i);
  if (scoped) {
    const domain = scoped[2].match(/^(D+\d+)/i)?.[1]?.toUpperCase() ?? scoped[2].toUpperCase();
    return { dictKey: scoped[1].toLowerCase(), domainCode: domain };
  }
  const bare = formKey.match(/^(D+\d+)/i);
  if (bare) return { dictKey: "pig", domainCode: bare[1].toUpperCase() };
  return { dictKey: "pig", domainCode: null };
}

export default function NhpTemplateEditor() {
  const goBack = useGoBack("/nhp-admin/template");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { formKey: formKeyParam, formId: formIdParam } = useParams<{ formKey: string; formId: string }>();
  const formKey = formKeyParam ?? "";
  const formId = formIdParam ? Number(formIdParam) : undefined;

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
  const [compositeDictKey, setCompositeDictKey] = useState("pig");
  const [atoms, setAtoms] = useState<NhpAtomRef[]>([]);
  const [atomSummary, setAtomSummary] = useState("");
  const [atomLocked, setAtomLocked] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [search, setSearch] = useState("");
  const [codelists, setCodelists] = useState<{ code: string; name: string }[]>([]);
  const [codelistOptions, setCodelistOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [busy, setBusy] = useState(false);
  const [addMenu, setAddMenu] = useState<{ sectionCode: string; subsectionCode: string | null } | null>(null);
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [dictGenerateOpen, setDictGenerateOpen] = useState(false);
  /** 组合编辑器内：添加缺失数据域原子 / 更换某原子 */
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerFocus, setComposerFocus] = useState<string | null>(null);

  const editorDictKey = useMemo(() => parseAtomScope(formKey).dictKey, [formKey]);
  const editorDomainCode = useMemo(() => parseAtomScope(formKey).domainCode, [formKey]);

  const structureQuery = useQuery({
    queryKey: ["nhp", "dict-structure", editorDictKey],
    queryFn: () => fetchNhpDictStructure(editorDictKey),
    enabled: !!formKey,
  });

  const domainNameMap = useMemo(
    () => buildDomainNameMap(structureQuery.data?.domains),
    [structureQuery.data],
  );

  const syncAtomSummary = (nextAtoms: NhpAtomRef[]) => {
    const picks = nextAtoms.map((a) => ({
      atomCode: a.atomCode,
      version: a.atomVersion,
      title: a.atomTitle,
    }));
    setAtomSummary(formatAtomPicksText(picks, domainNameMap));
  };

  useEffect(() => {
    if (!atoms.length) return;
    syncAtomSummary(atoms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainNameMap]);

  useEffect(() => {
    fetchNhpCodelists()
      .then((list) => setCodelists(list.map((c) => ({ code: c.code, name: c.name }))))
      .catch(() => {});
  }, []);

  // 预览用：按模板里出现的 dictKey 拉取码表选项（供 FieldPreview 渲染选项）
  useEffect(() => {
    const dictKeys = new Set<string>();
    for (const sec of sections) {
      for (const sub of sec.subsections ?? []) {
        for (const f of sub.fields) if (f.dictKey) dictKeys.add(f.dictKey);
      }
      for (const f of sec.fields ?? []) if (f.dictKey) dictKeys.add(f.dictKey);
    }
    if (dictKeys.size === 0) {
      setCodelistOptions({});
      return;
    }
    const map: Record<string, { value: string; label: string }[]> = {};
    Promise.all(
      [...dictKeys].map(async (code) => {
        try {
          const d = await fetchNhpCodelist(code);
          map[code] = d.items.map((i: NhpCodelistItem) => ({ value: i.itemCode, label: i.itemLabel }));
        } catch {
          map[code] = [];
        }
      }),
    ).then(() => setCodelistOptions(map));
  }, [sections]);

  useEffect(() => {
    if (!formKey) return;
    setBusy(true);
    const req = formId != null ? templateApi.fetchNhpTemplateById(formId) : templateApi.fetchNhpTemplate(formKey);
    req
      .then((t) => {
        load(sortSectionsByDomainCode(t.sections ?? []));
        setTitle(t.title ?? formKey);
        setStatus(t.status ?? "DRAFT");
        setVersion(t.version);
        setKind(t.kind === "ATOM" ? "ATOM" : "COMPOSITE");
        setCompositeDictKey((t.dictKey || "pig").trim() || "pig");
        setAtomLocked(!!t.locked);
        const nextAtoms = t.atoms ?? [];
        setAtoms(nextAtoms);
        if (nextAtoms.length) {
          setAtomSummary(
            formatAtomPicksText(
              nextAtoms.map((a) => ({
                atomCode: a.atomCode,
                version: a.atomVersion,
                title: a.atomTitle,
              })),
              domainNameMap,
            ),
          );
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
  }, [formKey, formId, load]);

  const applyTemplatePayload = (t: templateApi.NhpFormTemplate) => {
    load(sortSectionsByDomainCode(t.sections ?? []));
    setTitle(t.title ?? formKey);
    setStatus(t.status ?? "DRAFT");
    setVersion(t.version);
    setKind(t.kind === "ATOM" ? "ATOM" : "COMPOSITE");
    setCompositeDictKey((t.dictKey || "pig").trim() || "pig");
    setAtomLocked(!!t.locked);
    const nextAtoms = t.atoms ?? [];
    setAtoms(nextAtoms);
    if (nextAtoms.length) {
      setAtomSummary(
        formatAtomPicksText(
          nextAtoms.map((a) => ({
            atomCode: a.atomCode,
            version: a.atomVersion,
            title: a.atomTitle,
          })),
          domainNameMap,
        ),
      );
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
  // 原子：草稿且未被组合钉住可改结构；已发布须新建版本。组合：草稿可编辑（已发布须先新建草稿，但可钉原子升版）
  const editable =
    kind === "ATOM"
      ? !atomLocked && (status === "DRAFT" || status === "FREEZING" || !status)
      : status === "DRAFT" || status === "FREEZING" || !status;
  const canPinAtoms = kind === "COMPOSITE";
  const showEditMode = editable && viewMode === "edit";

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      void qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "assignable-templates"] });
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
        ...(formId != null ? { formId } : {}),
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

  const generateFromDomain = (dictKey: string, domainCode: string) =>
    run(async () => {
      const scopedKey = dictKey === "pig" ? domainCode : `${dictKey}__${domainCode}`;
      const t = await templateApi.generateFromDict(scopedKey, title || domainCode, dictKey);
      applyTemplatePayload(t);
      if (t.formKey && t.formKey !== formKey) {
        navigate(`/nhp-admin/template/edit/${encodeURIComponent(t.formKey)}`, { replace: true });
      }
      setDictGenerateOpen(false);
    }, "已从字段字典生成");

  const openDictGenerate = () => setDictGenerateOpen(true);

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
      navigate(`/nhp-admin/template/edit/${encodeURIComponent(formKey)}/${t.formId}`, {
        replace: true,
      });
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

  const handleRemoveSection = async (code: string) => {
    if (!editable) {
      toast.error(kind === "COMPOSITE" ? "已发布版本不可删章节，请先新建草稿" : "已锁定版本不可删除");
      return;
    }
    const sec = sections.find((s) => s.code === code);
    if (!sec) return;
    const n =
      (sec.fields?.length ?? 0) +
      (sec.subsections ?? []).reduce((sum, sub) => sum + (sub.fields?.length ?? 0), 0);
    const tip =
      n > 0
        ? `删除板块「${sec.label || code}」？其下 ${n} 道题目将一并删除。`
        : `删除板块「${sec.label || code}」？`;
    if (!await appConfirm(tip)) return;
    removeSection(code);
    if (kind === "COMPOSITE") {
      setAtoms((prev) => {
        const next = prev.filter((a) => a.atomCode !== code);
        syncAtomSummary(next);
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
    addSection(code, code);
    selectSection(code);
  };

  const handleAddSubsection = (sectionCode: string) => {
    const sec = sections.find((s) => s.code === sectionCode);
    if (!sec) return;
    const n = nextSubsectionNumber((sec.subsections ?? []).map((u) => u.code), sectionCode);
    const code = `${sectionCode}.${String(n).padStart(2, "0")}`;
    addSubsection(sectionCode, code, code);
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
              : statusLabel(status)
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
          <button type="button" className="aup-btn ghost" disabled={busy || !formKey} onClick={openDictGenerate}>
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

      {kind === "COMPOSITE" && canPinAtoms && (
        <div className="nhp-editor-stage-bar">
          <span className="aup-muted" style={{ fontWeight: 600 }}>
            数据域原子
          </span>
          {atoms.length === 0 ? (
            <span className="aup-muted">尚未钉住原子 — 删除章节后或点右侧添加</span>
          ) : (
            atoms.map((a) => (
              <span key={a.atomCode} className="nhp-editor-stage-chip">
                <AtomPickInline
                  pick={{ atomCode: a.atomCode, version: a.atomVersion, title: a.atomTitle }}
                  nameMap={domainNameMap}
                />
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
            删除左侧章节后可重新选择同数据域；同域不可重复添加。
            {!editable ? " 已发布组合钉原子将自动新建草稿版本。" : " 草稿与已发布原子均可钉，发布组合前建议先发布原子。"}
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
                  ? "点「添加数据域原子」勾选域模块并选版本（草稿或已发布均可钉）；删除章节后也可重新选择该域。"
                  : "原子不可随意覆盖：请用「新建版本」后再改。也可从字段字典按域生成结构。"}
              </div>
              <div className="acts">
                {kind === "COMPOSITE" ? (
                  <button
                    type="button"
                    className="aup-btn primary"
                    disabled={busy}
                    onClick={openAddStages}
                    title="勾选数据域原子并选版本；已发布组合将自动升草稿"
                  >
                    ＋ 添加数据域原子
                  </button>
                ) : (
                  <button type="button" className="aup-btn primary" disabled={busy || !editable} onClick={openDictGenerate}>
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
                        codelistOptions={codelistOptions}
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
                    codelistOptions={codelistOptions}
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

      {addMenu && <TypeMenu onPick={handlePickType} onPickTemplate={handlePickTemplate} onPickFromDict={() => setFieldPickerOpen(true)} onClose={() => setAddMenu(null)} />}

      {fieldPickerOpen && addMenu && (
        <FieldPicker
          defaultDictKey={editorDictKey}
          onPick={async (field: NhpField, type: FieldType) => {
            const sec = sections.find((s) => s.code === addMenu.sectionCode);
            if (!sec) return;
            // 字段字典带码表（codelistId）时，解析成 dictKey（码表 code）一并带进题目
            let dictKey: string | undefined;
            if (field.codelistId) {
              try {
                const cl = await fetchNhpCodelistById(field.codelistId);
                dictKey = cl.code;
              } catch {
                dictKey = undefined;
              }
            }
            const nf: FormField = {
              fieldKey: field.fieldCode,
              label: field.nameCn || field.nameEn,
              type,
              required: field.required === "YES",
              dataType: field.dataType,
              dictKey,
            };
            addField(addMenu.sectionCode, addMenu.subsectionCode, nf);
            selectField(field.fieldCode);
            setFieldPickerOpen(false);
            setAddMenu(null);
          }}
          onClose={() => setFieldPickerOpen(false)}
        />
      )}

      {dictGenerateOpen && kind === "ATOM" && (
        <DictDomainGenerateDialog
          initialDictKey={editorDictKey}
          initialDomainCode={editorDomainCode}
          confirming={busy}
          onClose={() => !busy && setDictGenerateOpen(false)}
          onConfirm={(dictKey, domainCode) => generateFromDomain(dictKey, domainCode)}
        />
      )}

      {composerOpen && kind === "COMPOSITE" && (
        <div className="nhp-editor-composer-mask" onClick={() => !busy && setComposerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <NhpCompositeComposer
              mode="edit"
              hideMeta
              defaultDictKey={compositeDictKey}
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
  codelistOptions,
}: {
  field: FormField;
  showEdit: boolean;
  conditionText: string;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
  codelistOptions?: Record<string, { value: string; label: string }[]>;
}) {
  const resolvedOptions =
    field.options && field.options.length > 0
      ? field.options
      : field.dictKey
        ? codelistOptions?.[field.dictKey]
        : undefined;
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
        <NhpFormField field={{ ...field, options: resolvedOptions }} value={undefined} onChange={() => {}} />
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
