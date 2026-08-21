/**
 * NHP CRF 填写工作台（门户 / 管理预览共用）。
 * 版式对齐 AUP `/#/aup/fill`：缓冲页 → 顶栏文档动作 + 阶段条 + 左章节 / 中表单 / 右留痕。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import type { FormField, FormTemplate } from "../schema/formTemplate";
import NhpFormField from "./NhpFormField";
import NhpStageStepper, {
  hasFieldValue,
  primaryDomainForStage,
  stageForDomain,
  type NhpBizStage,
} from "./NhpStageStepper";
import NhpSectionNav from "./NhpSectionNav";
import NhpTracePanel from "./NhpTracePanel";
import NhpSnapshotDrawer from "./NhpSnapshotDrawer";
import NhpQueryPanel from "./NhpQueryPanel";
import ScrollButtons from "@/features/aup/components/ScrollButtons";
import { authStorage } from "@/features/auth/authStorage";
import { fetchNhpTemplates, fetchNhpTemplateById, fillableFormId, isFillablePublished, type NhpTemplateListItem, type NhpFormTemplate } from "../api/nhpTemplate.api";
import { fetchNhpCodelist, type NhpCodelistItem } from "../api/nhpCodelist.api";
import { fetchNhpDictStructure } from "../api/nhpFieldDictionary.api";
import {
  upsertNhpValues,
  fetchNhpRecordDetail,
  fetchNhpAudit,
  updateNhpRecordStatus,
  createNhpSnapshot,
  submitNhpDoubleEntry,
  compareNhpDoubleEntry,
  fetchNhpSecondValues,
  type NhpSubject,
  type NhpRecord,
  type NhpAuditEntry,
} from "../api/nhpRecord.api";
import { sortSectionsByDomainCode } from "../utils/domainSort";
import { formatSectionTitle, isBlankOrSameAsCode } from "../utils/nhpSectionTitle";
import {
  applyNhpStickyChromeVars,
  findScrollParent,
  measureNhpStickyChrome,
  scrollElementBelowSticky,
  stickyActiveLineY,
  stickyScrollOffset,
} from "../utils/nhpStickyChrome";
import { animalTypeLabel } from "../utils/nhpSubjectLabels";

function flattenFields(template: FormTemplate | null): FormField[] {
  const out: FormField[] = [];
  if (!template) return out;
  for (const sec of template.sections ?? []) {
    for (const sub of sec.subsections ?? []) out.push(...sub.fields);
    out.push(...(sec.fields ?? []));
  }
  return out;
}

function isPublished(t: NhpTemplateListItem): boolean {
  return isFillablePublished(t);
}

function statusLabel(status?: string | null): string {
  const s = (status || "").toUpperCase();
  if (s === "LOCKED") return "已锁定";
  if (s === "COMPLETE") return "已完成（待锁定）";
  if (s === "DRAFT") return "草稿";
  return status || "—";
}

export default function NhpFillWorkbench({
  mode = "portal",
}: {
  mode?: "portal" | "adminPreview";
}) {
  const goBack = useGoBack(mode === "adminPreview" ? "/content-manager/nhp-records" : "/nhp/fill", {
    preferHistory: mode !== "adminPreview",
  });
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const snapshotViewId = searchParams.get("snapshot");
  const entered = searchParams.get("enter") === "1";

  const operatorId = authStorage.getUserInfo()?.id?.trim() || undefined;

  const [templates, setTemplates] = useState<NhpTemplateListItem[]>([]);
  const [formKey, setFormKey] = useState("");
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [templateMeta, setTemplateMeta] = useState<Pick<NhpFormTemplate, "dictKey" | "kind"> | null>(null);
  const [sectionNameMap, setSectionNameMap] = useState<Record<string, string> | null>(null);
  const [subject, setSubject] = useState<NhpSubject | null>(null);
  const [record, setRecord] = useState<NhpRecord | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [dictOptions, setDictOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const [audits, setAudits] = useState<NhpAuditEntry[]>([]);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [entryPass, setEntryPass] = useState<1 | 2>(1);
  const [secondValues, setSecondValues] = useState<Record<string, unknown>>({});
  const [compareSummary, setCompareSummary] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  /** 点击「提交」后仍有未完整章节时，侧栏显示红 ✗（对齐 AUP 校验失败指示） */
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const scrollLockRef = useRef(false);
  const scrollLockTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const stickyChromeHRef = useRef(0);

  const locked = (record?.status || "").toUpperCase() === "LOCKED";
  const canEdit = !locked && !snapshotViewId;
  const statusUp = (record?.status || "").toUpperCase();

  const fillBase =
    mode === "adminPreview"
      ? `/content-manager/nhp-entry/${routeId}`
      : `/nhp/fill/${routeId}`;

  const enterFill = () => {
    const next = new URLSearchParams(searchParams);
    next.set("enter", "1");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    setListLoading(true);
    // 门户/缓冲：已发布原子或组合均可（头为草稿时用 publishedFormId）
    void Promise.all([
      fetchNhpTemplates("COMPOSITE").catch(() => [] as NhpTemplateListItem[]),
      fetchNhpTemplates("ATOM").catch(() => [] as NhpTemplateListItem[]),
    ])
      .then(([composites, atoms]) => {
        const list = [...composites, ...atoms];
        const usable = mode === "portal" ? list.filter(isPublished) : list;
        const ordered = [...usable].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
        setTemplates(ordered);
        if (ordered.length > 0) setFormKey((prev) => prev || ordered[0].formKey);
        else setFormKey("");
      })
      .catch((e: Error) => {
        setLoadError(e.message || "加载模板失败");
        toast.error(e.message || "加载模板失败");
      })
      .finally(() => setListLoading(false));
  }, [mode]);

  /* ---------- 续填：加载实例详情（按 formId 钉住结构版本） ---------- */
  useEffect(() => {
    if (!routeId) return;
    const rid = Number(routeId);
    if (!rid) return;
    setDetailLoading(true);
    fetchNhpRecordDetail(rid)
      .then(async (detail) => {
        setRecord(detail.record);
        setSubject(detail.subject);
        setValues(detail.values ?? {});
        setSnapshotCount(detail.snapshotCount ?? 0);
        const formId = detail.record.formId;
        if (formId) {
          try {
            const t = await fetchNhpTemplateById(formId);
            const sections = sortSectionsByDomainCode(t.sections ?? []);
            setTemplate({ ...t, sections });
            setTemplateMeta({ dictKey: t.dictKey, kind: t.kind });
            setFormKey(t.formKey);
            const first = sections[0]?.code ?? "";
            setActiveId(first || null);
          } catch (e) {
            toast.error((e as Error).message || "加载模板结构失败");
          }
        }
      })
      .catch((e: Error) => toast.error(e.message || "加载记录失败"))
      .finally(() => setDetailLoading(false));
  }, [routeId]);

  /* ---------- 无实例时：选组合模板预览结构 ---------- */
  useEffect(() => {
    if (routeId) return;
    if (!formKey) {
      setTemplate(null);
      setTemplateMeta(null);
      setSectionNameMap(null);
      return;
    }
    const hit = templates.find((t) => t.formKey === formKey);
    const previewId = hit ? fillableFormId(hit) ?? hit.formId : undefined;
    if (!previewId) return;
    fetchNhpTemplateById(previewId)
      .then((t) => {
        const sections = sortSectionsByDomainCode(t.sections ?? []);
        setTemplate({ ...t, sections });
        setTemplateMeta({ dictKey: t.dictKey, kind: t.kind });
        const first = sections[0]?.code ?? "";
        setActiveId(first || null);
      })
      .catch((e: Error) => toast.error(e.message || "加载模板结构失败"));
  }, [formKey, routeId, templates]);

  /* ---------- 字段字典大纲名 → 填写侧章节中文名回退 ---------- */
  useEffect(() => {
    const dk = (templateMeta?.dictKey || "").trim();
    if (!dk || dk === "mixed") {
      setSectionNameMap(null);
      return;
    }
    let cancelled = false;
    fetchNhpDictStructure(dk)
      .then((st) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const d of st.domains ?? []) {
          const code = (d.code || "").trim();
          const name = (d.name || "").trim();
          if (code && name && !isBlankOrSameAsCode(code, name)) {
            map[code.toUpperCase()] = name;
            map[code] = name;
          }
          for (const s of d.submodules ?? []) {
            const sc = (s.code || "").trim();
            const sn = (s.name || "").trim();
            if (sc && sn && !isBlankOrSameAsCode(sc, sn)) {
              map[sc.toUpperCase()] = sn;
              map[sc] = sn;
            }
          }
        }
        setSectionNameMap(Object.keys(map).length ? map : null);
      })
      .catch(() => {
        if (!cancelled) setSectionNameMap(null);
      });
    return () => {
      cancelled = true;
    };
  }, [templateMeta?.dictKey]);

  /* ---------- 码表 ---------- */
  useEffect(() => {
    if (!template) return;
    const dictKeys = [...new Set(flattenFields(template).map((f) => f.dictKey).filter(Boolean))] as string[];
    const map: Record<string, { value: string; label: string }[]> = {};
    Promise.all(
      dictKeys.map(async (code) => {
        try {
          const d = await fetchNhpCodelist(code);
          map[code] = d.items.map((i: NhpCodelistItem) => ({ value: i.itemCode, label: i.itemLabel }));
        } catch {
          map[code] = [];
        }
      }),
    ).then(() => setDictOptions(map));
  }, [template]);

  const refreshAudit = async (recordId?: number | null) => {
    if (!recordId) {
      setAudits([]);
      return;
    }
    try {
      setAudits(await fetchNhpAudit(recordId));
    } catch {
      setAudits([]);
    }
  };

  useEffect(() => {
    void refreshAudit(record?.id);
  }, [record?.id]);

  useEffect(() => {
    if (!record?.id) {
      setSecondValues({});
      return;
    }
    fetchNhpSecondValues(record.id)
      .then(setSecondValues)
      .catch(() => setSecondValues({}));
  }, [record?.id]);

  const sections = useMemo(() => template?.sections ?? [], [template]);
  const [showBizHint, setShowBizHint] = useState(false);
  const activeValues = entryPass === 2 ? secondValues : values;

  /** 快照/状态用弱语境：当前 TOC 章节关联的可选业务标签（非域流水线） */
  const softBizStage: NhpBizStage = useMemo(() => {
    const status = (record?.status || "").toUpperCase();
    if (status === "LOCKED") return "lock";
    if (status === "COMPLETE") return "lock";
    if (activeId) return stageForDomain(activeId);
    const first = sections[0]?.code;
    return first ? stageForDomain(first) : "donor";
  }, [record?.status, activeId, sections]);

  const formTitle = template?.title || formKey || "CRF";
  const pageTitle = `${formKey ? formKey + " · " : ""}${formTitle}`;
  const metaLine = [
    subject ? `${animalTypeLabel(subject.subjectType)} ${subject.subjectCode}` : null,
    record ? `实例 #${record.id}` : null,
    record ? `状态 ${statusLabel(record.status)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /* ---------- 吸顶高度 ---------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const host = (root.closest(".aup-app") as HTMLElement | null) ?? root;

    const sync = () => {
      const m = measureNhpStickyChrome(root, mode);
      stickyChromeHRef.current = m.chromeH;
      applyNhpStickyChromeVars(host, m);
      scrollParentRef.current = mode === "adminPreview" ? findScrollParent(root) : null;
    };

    sync();
    const ro = new ResizeObserver(sync);
    const toolbar = root.querySelector(".toolbar");
    const stepper = root.querySelector(".stepper-wrap");
    if (toolbar) ro.observe(toolbar);
    if (stepper) ro.observe(stepper);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [mode, template, record?.status, subject?.subjectCode, formKey, entered, toolsOpen, showBizHint]);

  /* ---------- 滚动高亮章节 ---------- */
  useEffect(() => {
    if (!sections.length || !entered) return;

    const scrollParent = mode === "adminPreview" ? findScrollParent(rootRef.current) : null;
    scrollParentRef.current = scrollParent;

    const onScroll = () => {
      if (scrollLockRef.current) return;
      const root = rootRef.current;
      const chromeH = root
        ? measureNhpStickyChrome(root, mode).chromeH
        : stickyChromeHRef.current;
      stickyChromeHRef.current = chromeH;
      const lineY = stickyActiveLineY(chromeH, scrollParent);
      let current: string | null = null;
      for (const s of sections) {
        const secEl = document.getElementById(`nhp-section-${s.code}`);
        if (secEl && secEl.getBoundingClientRect().top <= lineY) current = s.code;
        for (const sub of s.subsections ?? []) {
          const subEl = document.getElementById(`nhp-subsection-${sub.code}`);
          if (subEl && subEl.getBoundingClientRect().top <= lineY) current = sub.code;
        }
      }
      if (current) setActiveId(current);
      else if (sections[0]) setActiveId(sections[0].code);
    };

    const target: HTMLElement | Document = scrollParent ?? document;
    target.addEventListener("scroll", onScroll, { capture: true, passive: true } as AddEventListenerOptions);
    onScroll();
    return () => target.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
  }, [sections, mode, entered]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error((e as Error)?.message || "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      if (!record) return;
      const src = entryPass === 2 ? secondValues : values;
      const list = Object.entries(src)
        .filter(([, v]) => hasFieldValue(v))
        .map(([fieldCode, value]) => ({ fieldCode, value }));
      if (entryPass === 2) {
        await submitNhpDoubleEntry(record.id, { values: list, operatorId, replace: true });
        setSecondValues(await fetchNhpSecondValues(record.id));
      } else {
        await upsertNhpValues(record.id, list, operatorId);
      }
      await refreshAudit(record.id);
    }, entryPass === 2 ? "已保存二录" : `已保存 ${Object.keys(values).filter((k) => hasFieldValue(values[k])).length} 个字段`);

  const runCompare = () =>
    run(async () => {
      if (!record) return;
      const res = await compareNhpDoubleEntry(record.id);
      if (res.match) {
        setCompareSummary(`比对一致（一录 ${res.firstCount} / 二录 ${res.secondCount}）`);
        toast.success("两录一致");
      } else {
        const sample = (res.diffs || []).slice(0, 5).map((d) => d.fieldCode).join("、");
        setCompareSummary(`差异 ${res.diffCount} 项：${sample}${(res.diffs?.length || 0) > 5 ? "…" : ""}`);
        toast.error(`发现 ${res.diffCount} 处差异`);
      }
    }, "比对完成");

  const markComplete = () => {
    const allFields = flattenFields(template);
    const missingRequired = allFields.filter((f) => f.required && !hasFieldValue(values[f.fieldKey]));
    if (missingRequired.length > 0) {
      setSubmitAttempted(true);
      toast.error(`还有 ${missingRequired.length} 个必填项未填，请补全后再提交（未涉及的域可留空）`);
      const firstKey = missingRequired[0]?.fieldKey;
      if (firstKey) {
        const sec = sections.find(
          (s) =>
            (s.fields ?? []).some((f) => f.fieldKey === firstKey) ||
            (s.subsections ?? []).some((u) => (u.fields ?? []).some((f) => f.fieldKey === firstKey)),
        );
        if (sec) handleSelect(sec.code);
      }
      return;
    }
    setSubmitAttempted(false);
    run(async () => {
      if (!record) return;
      await upsertNhpValues(
        record.id,
        Object.entries(values)
          .filter(([, v]) => hasFieldValue(v))
          .map(([fieldCode, value]) => ({ fieldCode, value })),
        operatorId,
      );
      const r = await updateNhpRecordStatus(record.id, {
        status: "COMPLETE",
        operatorId,
        bizStage: softBizStage,
        note: "提交完成快照",
      });
      setRecord(r);
      setSnapshotCount((c) => c + 1);
      await refreshAudit(record.id);
    }, "已提交完成并生成快照");
  };

  const markLocked = () =>
    run(async () => {
      if (!record) return;
      const r = await updateNhpRecordStatus(record.id, {
        status: "LOCKED",
        operatorId,
        bizStage: "lock",
        note: "数据锁定归档",
      });
      setRecord(r);
      setSnapshotCount((c) => c + 1);
      await refreshAudit(record.id);
    }, "已锁定并归档快照");

  const makeSnapshot = () =>
    run(async () => {
      if (!record) return;
      await createNhpSnapshot(record.id, { operatorId, bizStage: softBizStage, note: "手动快照" });
      setSnapshotCount((c) => c + 1);
      await refreshAudit(record.id);
    }, "已创建快照");

  const resolveOptions = (f: FormField) => {
    if (f.options && f.options.length > 0) return f.options;
    return f.dictKey ? dictOptions[f.dictKey] : undefined;
  };

  const handleSelect = (sid: string) => {
    setActiveId(sid);
    scrollLockRef.current = true;
    if (scrollLockTimerRef.current != null) window.clearTimeout(scrollLockTimerRef.current);
    scrollLockTimerRef.current = window.setTimeout(() => {
      scrollLockRef.current = false;
    }, 600);
    const el =
      document.getElementById(`nhp-subsection-${sid}`) ?? document.getElementById(`nhp-section-${sid}`);
    if (!el) return;
    const root = rootRef.current;
    const chromeH = root ? measureNhpStickyChrome(root, mode).chromeH : stickyChromeHRef.current;
    stickyChromeHRef.current = chromeH;
    const scrollParent =
      mode === "adminPreview"
        ? scrollParentRef.current ?? findScrollParent(root)
        : null;
    scrollElementBelowSticky(el, scrollParent, stickyScrollOffset(chromeH));
  };

  const onStageSelect = (stage: NhpBizStage) => {
    const domain = primaryDomainForStage(stage);
    if (domain) {
      const sec = sections.find((s) => s.code.toUpperCase().startsWith(domain));
      if (sec) handleSelect(sec.code);
    }
  };

  const goBackList = () => {
    goBack();
  };

  const primarySubmit =
    canEdit && record && entryPass === 1
      ? statusUp === "DRAFT"
        ? { label: "提交", onClick: markComplete }
        : statusUp === "COMPLETE"
          ? { label: "数据锁定", onClick: markLocked }
          : null
      : null;

  /* ---------- 加载 / 无模板 ---------- */
  if (listLoading && !routeId) {
    return <div className="aup-empty">加载已发布模板…</div>;
  }

  if (mode === "portal" && !loadError && templates.length === 0 && !routeId) {
    return (
      <div className="aup-empty" style={{ maxWidth: 480, margin: "0 auto", paddingTop: 80 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>暂无可用模板</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: 20 }}>
          尚无已发布的组合模板，暂时无法开填。请联系管理员完成模板发布后再试。
        </p>
        <Link to="/" className="btn ghost" style={{ textDecoration: "none" }}>
          ← 返回门户
        </Link>
      </div>
    );
  }

  /* ---------- 无 :id：由 NhpFillEntryGate 承接（门户 / 管理 nhp-entry） ---------- */
  if (!routeId) {
    return (
      <div className="aup-empty" style={{ paddingTop: 48 }}>
        请从数据采集入口选择或登记研究对象。
      </div>
    );
  }

  /* ---------- 有 :id 但未 enter：缓冲页（对齐 AUP aup-landing，文案克制） ---------- */
  if (!entered) {
    if (detailLoading && !record) {
      return <div className="aup-empty">加载表单实例…</div>;
    }
    const ctaLabel =
      statusUp === "LOCKED" || statusUp === "COMPLETE" || snapshotViewId
        ? "查看表单"
        : Object.keys(values).some((k) => hasFieldValue(values[k]))
          ? "继续填写"
          : "开始填写";
    const subjectLine = subject
      ? `${animalTypeLabel(subject.subjectType)} ${subject.subjectCode}`
      : "对象加载中…";
    return (
      <div className="aup-landing-wrap">
        <div className="aup-landing">
        <button type="button" className="btn ghost small aup-landing-back" onClick={goBackList}>
          ← 返回
        </button>
        <h2>准备填写</h2>
        <ol className="nhp-fill-process" aria-label="采集流程" style={{ marginBottom: 20 }}>
          <li className="done">
            <span className="n">1</span>
            <span className="t">选择 / 登记对象</span>
          </li>
          <li className="done">
            <span className="n">2</span>
            <span className="t">选择模板 / 实例</span>
          </li>
          <li className="on">
            <span className="n">3</span>
            <span className="t">开始填写</span>
          </li>
        </ol>
        <div className="aup-landing-desc" style={{ textAlign: "center", marginBottom: 24 }}>
          <strong style={{ color: "var(--text)", fontSize: 15 }}>
            {subjectLine}
            {" · "}
            {formKey || formTitle}
            {" · "}
            {statusLabel(record?.status)}
          </strong>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
            实例 #{routeId}
            {template?.title ? ` · ${template.title}` : ""}
          </div>
        </div>
        <div className="aup-landing-cta">
          <button type="button" className="btn primary" onClick={enterFill}>
            {ctaLabel}
          </button>
          <Link
            to={mode === "adminPreview" ? "/content-manager/nhp-entry" : "/nhp/fill"}
            className="btn ghost"
            style={{ textDecoration: "none" }}
          >
            重选对象
          </Link>
          {mode === "adminPreview" && (
            <Link to="/content-manager/nhp-records" className="nhp-admin-preview-link" style={{ alignSelf: "center" }}>
              实例管理
            </Link>
          )}
        </div>
        </div>
      </div>
    );
  }

  /* ---------- 正式填写工作台 ---------- */
  return (
    <div
      ref={rootRef}
      className={mode === "adminPreview" ? "nhp-fill-root nhp-fill-root--embedded" : "nhp-fill-root"}
    >
      {/* 文档动作顶栏：对齐 AUP Toolbar —— 返回 / 模板名 / 保存 / 提交 */}
      <div className="toolbar">
        <button type="button" className="btn ghost" onClick={goBackList}>
          ← 返回
        </button>
        <span className="tag" style={{ background: "var(--success-weak)", color: "var(--success)" }}>
          {formKey || "NHP CRF"}
        </span>
        {mode === "adminPreview" && (
          <span className="nhp-admin-preview-chip" title="管理侧填写，与门户同构">
            管理填写
          </span>
        )}
        <span className="spacer" />
        <span className="autosave" style={{ fontSize: 12, color: "var(--muted)" }}>
          {locked ? "已锁定 · 只读" : snapshotViewId ? "快照只读" : "编辑中"}
        </span>
        {canEdit && record && (
          <>
            <button type="button" className="btn ghost" disabled={busy} onClick={save}>
              {entryPass === 2 ? "保存二录" : "保存草稿"}
            </button>
            {primarySubmit && (
              <button type="button" className="btn primary" disabled={busy} onClick={primarySubmit.onClick}>
                {primarySubmit.label}
              </button>
            )}
          </>
        )}
      </div>

      {/* 页面抬头：这是什么页 */}
      <div className="nhp-fill-page-hd">
        <div>
          <h1>{pageTitle}</h1>
          <div className="sub">{metaLine || "加载实例信息…"}</div>
        </div>
        <div className="nhp-fill-page-hd-acts">
          <button type="button" className="btn ghost small" onClick={() => setToolsOpen((v) => !v)}>
            {toolsOpen ? "收起工具" : "更多工具"}
          </button>
          <Link
            to={mode === "adminPreview" ? "/content-manager/nhp-records" : "/nhp/fill"}
            className="btn ghost small"
            style={{ textDecoration: "none" }}
          >
            {mode === "adminPreview" ? "实例列表" : "重选动物"}
          </Link>
        </div>
      </div>

      {toolsOpen && record && (
        <div className="nhp-fill-tools">
          <div className="nhp-fill-tools-label">次要工具</div>
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <button
              type="button"
              className="btn ghost small"
              style={{ borderRadius: 0, background: entryPass === 1 ? "var(--primary-weak)" : undefined }}
              onClick={() => setEntryPass(1)}
            >
              一录
            </button>
            <button
              type="button"
              className="btn ghost small"
              style={{ borderRadius: 0, background: entryPass === 2 ? "var(--primary-weak)" : undefined }}
              disabled={!canEdit && Object.keys(secondValues).length === 0}
              onClick={() => setEntryPass(2)}
            >
              二录
            </button>
          </div>
          <button type="button" className="btn ghost small" disabled={busy || !record} onClick={runCompare}>
            比对
          </button>
          <button type="button" className="btn ghost small" onClick={() => setSnapOpen(true)}>
            快照{snapshotCount > 0 ? `(${snapshotCount})` : ""}
          </button>
          {canEdit && entryPass === 1 && (
            <button type="button" className="btn ghost small" disabled={busy} onClick={makeSnapshot}>
              打快照
            </button>
          )}
          {mode === "adminPreview" && (
            <Link to={`/nhp/fill/${record.id}?enter=1`} className="btn ghost small" style={{ textDecoration: "none" }}>
              门户正式填写
            </Link>
          )}
          <Link to={fillBase} className="btn ghost small" style={{ textDecoration: "none" }}>
            回缓冲页
          </Link>
        </div>
      )}

      {compareSummary && (
        <div className="nhp-fill-banner muted">双录入 · {compareSummary}</div>
      )}
      {entryPass === 2 && (
        <div className="nhp-fill-banner warn">
          当前为二录模式：保存写入 entry_pass=2，与一录隔离；用「比对」查看差异。
        </div>
      )}

      <div className="nhp-fill-hint-bar">
        <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
          章节按展示序列出，可任意跳转；域码是表码不是步骤。提交只校验必填项，未涉及的域可留空。
        </span>
        <button
          type="button"
          className="btn ghost small"
          style={{ fontSize: 11, marginLeft: 8 }}
          onClick={() => setShowBizHint((v) => !v)}
        >
          {showBizHint ? "收起业务提示" : "业务语境提示"}
        </button>
      </div>
      {showBizHint && (
        <NhpStageStepper
          active={softBizStage}
          recordStatus={record?.status}
          subtitle="可选业务语境（与域表码正交；非 D1→D10 流水线）"
          onSelect={onStageSelect}
        />
      )}

      {!template ? (
        <div className="aup-empty">{loadError || "加载模板…"}</div>
      ) : (
        <div className="layout">
          <NhpSectionNav
            sections={sections}
            values={activeValues}
            activeId={activeId}
            onSelect={handleSelect}
            nameMap={sectionNameMap}
            submitAttempted={submitAttempted}
          />

          <main className="main">
            {sections.map((sec) => (
              <section key={sec.code} id={`nhp-section-${sec.code}`} className="card aup-section">
                <h2>
                  {formatSectionTitle(sec.code, sec.label, sectionNameMap)}
                </h2>
                {(sec.subsections ?? []).map((sub) => (
                  <div key={sub.code} id={`nhp-subsection-${sub.code}`} className="aup-subsection">
                    <div className="aup-subhead">{formatSectionTitle(sub.code, sub.label, sectionNameMap)}</div>
                    {(sub.fields ?? []).map((f) => (
                      <FieldInput
                        key={f.fieldKey}
                        field={f}
                        options={resolveOptions(f)}
                        value={activeValues[f.fieldKey]}
                        readOnly={!canEdit}
                        onChange={(v) =>
                          entryPass === 2
                            ? setSecondValues((p) => ({ ...p, [f.fieldKey]: v }))
                            : setValues((p) => ({ ...p, [f.fieldKey]: v }))
                        }
                      />
                    ))}
                  </div>
                ))}
                {(sec.fields ?? []).map((f) => (
                  <FieldInput
                    key={f.fieldKey}
                    field={f}
                    options={resolveOptions(f)}
                    value={activeValues[f.fieldKey]}
                    readOnly={!canEdit}
                    onChange={(v) =>
                      entryPass === 2
                        ? setSecondValues((p) => ({ ...p, [f.fieldKey]: v }))
                        : setValues((p) => ({ ...p, [f.fieldKey]: v }))
                    }
                  />
                ))}
              </section>
            ))}
          </main>

          <NhpTracePanel
            audits={audits}
            snapshotCount={snapshotCount}
            onOpenSnapshots={record ? () => setSnapOpen(true) : undefined}
          >
            <NhpQueryPanel recordId={record?.id} operatorId={operatorId} readOnly={!canEdit} />
          </NhpTracePanel>
        </div>
      )}

      <NhpSnapshotDrawer
        open={snapOpen}
        recordId={record?.id}
        readOnly={!canEdit}
        operatorId={operatorId}
        bizStage={softBizStage}
        onClose={() => setSnapOpen(false)}
        onCreated={() => {
          setSnapshotCount((c) => c + 1);
          void refreshAudit(record?.id);
        }}
        onRolledBack={({ values: next, recordStatus, snapshotCount: sc }) => {
          setValues(next);
          setRecord((r) => (r ? { ...r, status: recordStatus } : r));
          setSnapshotCount(sc);
          setEntryPass(1);
          void refreshAudit(record?.id);
        }}
      />
      <ScrollButtons scrollRef={scrollParentRef} />
    </div>
  );
}

function FieldInput({
  field,
  options,
  value,
  onChange,
  readOnly,
}: {
  field: FormField;
  options: FormField["options"];
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="field" style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
        {field.label}
        {field.required ? <span style={{ color: "var(--danger)" }}> *</span> : null}
        {field.config?.unit ? (
          <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 500 }}>（{field.config.unit}）</span>
        ) : null}
      </label>
      <NhpFormField field={{ ...field, options }} value={value} onChange={onChange} readOnly={readOnly} />
      {field.description ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{field.description}</div> : null}
      {field.dictKey ? <div style={{ fontSize: 11, color: "var(--muted)" }}>码表 {field.dictKey}</div> : null}
    </div>
  );
}
