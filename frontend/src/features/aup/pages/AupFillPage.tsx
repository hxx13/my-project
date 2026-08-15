import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  useAupAttachments,
  useAupDraft,
  useAupList,
  useAupMyRoles,
  useAupTraces,
  useAupTemplateById,
  useCreateAup,
  usePublishedTemplate,
  useReviewItems,
} from "../hooks/useAup";
import { useGoBack } from "../hooks/useGoBack";
import { fetchAupPrintData, fetchAupValidate, saveAup, submitAup } from "../api/aup.api";
import type { FormField as FormFieldDef, FormSection, FormSubSection } from "../schema/formTemplate";
import type { ReviewItem } from "../schema/review";
import Toolbar from "../components/Toolbar";
import StageStepper from "../components/StageStepper";
import SectionNav from "../components/SectionNav";
import FormField, { displayTitle, evaluateShowWhen, hasValue, normalizeOptions } from "../components/FormField";
import TracePanel from "../components/TracePanel";
import SnapshotDrawer from "../components/SnapshotDrawer";
import { FieldReviewTag } from "../components/FieldReviewTag";
import ScrollButtons from "../components/ScrollButtons";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import "../aup.css";

/** 乐观锁冲突判定：authHttp 把 409 转成 Error，仅保留 message */
function isConflict(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /409|冲突|其他端|已被修改|乐观锁/i.test(m);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function AupFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const goBack = useGoBack("/");

  const createMut = useCreateAup();
  const draft = useAupDraft(id);
  const tracesQuery = useAupTraces(id);
  const record = draft.detail.data?.record;
  // 有 id = 续填：用记录冻结的模板快照；无 id = 新建：直接用当前已发布模板（本地填写，不建 id）
  const templateQuery = useAupTemplateById(record?.templateId ?? undefined);
  const publishedQuery = usePublishedTemplate(id ? undefined : "aup");

  const [activeId, setActiveId] = useState<string | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [exitDialog, setExitDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingExit, setSavingExit] = useState(false);
  const [entered, setEntered] = useState(false);
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set());
  const [validationErrors, setValidationErrors] = useState<{ fieldKey: string; message: string }[]>([]);
  const [validationOpen, setValidationOpen] = useState(false);

  // 同课题组唯一非审核完毕计划书：无 id 时查本课题组是否已有草稿，有则自动加载（协作续填）
  const projectGroupName = (authStorage.getUserInfo() as { projectGroupName?: string | null } | null)?.projectGroupName?.trim() || "";
  const existingDraftQuery = useAupList(
    id ? { size: 0 } : { projectGroupName: projectGroupName || undefined, stage: "draft", size: 1 }
  );
  useEffect(() => {
    if (id || !projectGroupName) return;
    const draftItem = existingDraftQuery.data?.items?.[0];
    if (draftItem) navigate(`/aup/fill/${draftItem.id}`, { replace: true });
  }, [id, projectGroupName, existingDraftQuery.data, navigate]);

  /* ---------- 模板结构：无 id 走已发布模板，有 id 走记录快照模板 ---------- */
  const rawSections = id ? templateQuery.data?.sections : publishedQuery.data?.sections;
  const templateName = id ? templateQuery.data?.name : publishedQuery.data?.name;
  const currentStage = record?.currentStage ?? "draft";
  const readOnly = id ? currentStage !== "draft" : false;

  const isLoading = id
    ? draft.detail.isLoading || templateQuery.isLoading || !rawSections
    : publishedQuery.isLoading;

  // 滚动定位：随页面滚动高亮当前所在章节/小节（顶部栏遮罩补偿）。
  // 注意：useEffect 必须在所有条件 return 之前调用，否则违反 Hooks 规则。
  useEffect(() => {
    const secs = rawSections;
    if (!secs) return;
    const onScroll = () => {
      const offset = 96;
      let current: string | null = null;
      for (const s of secs) {
        const secEl = document.getElementById(`aup-section-${s.code}`);
        if (secEl && secEl.getBoundingClientRect().top <= offset) current = s.code;
        for (const sub of s.subsections ?? []) {
          const subEl = document.getElementById(`aup-subsection-${sub.code}`);
          if (subEl && subEl.getBoundingClientRect().top <= offset) current = sub.code;
        }
      }
      if (current) setActiveId(current);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    onScroll();
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [rawSections]);

  // 固定选中选项默认并入 values（渲染/保存用；rawSections 为空时原样返回）
  const effectiveValues = useMemo(() => {
    const next = { ...draft.values };
    if (!rawSections) return next;
    for (const s of rawSections) {
      const fields = [...(s.fields ?? []), ...(s.subsections ?? []).flatMap((u) => u.fields ?? [])];
      for (const f of fields) {
        if (f.type !== "choice") continue;
        const fixed = normalizeOptions(f.options).filter((o) => o.fixed).map((o) => o.value);
        if (!fixed.length) continue;
        if (f.config?.choiceType === "multiple") {
          const cur = Array.isArray(next[f.fieldKey]) ? (next[f.fieldKey] as string[]) : [];
          const merged = [...cur];
          for (const v of fixed) if (!merged.includes(v)) merged.push(v);
          next[f.fieldKey] = merged;
        } else if (next[f.fieldKey] == null || next[f.fieldKey] === "") {
          next[f.fieldKey] = fixed[0];
        }
      }
    }
    return next;
  }, [rawSections, draft.values]);

  // 是否已填写任何内容（用于提交/保存按钮禁用，排除固定默认值）
  const hasContent = useMemo(() => Object.values(draft.values).some((v) => hasValue(v)), [draft.values]);

  // 提交权限：草稿阶段所有可编辑人均可提交（申请人/同组/组长/教职工/管理员）。
  // 提交后按身份分流：组长/教职工直通格式审查，实验员进组长审核；后端 assertCanSubmit 兜底鉴权。
  const canSubmit = hasContent;

  // 逐字段评审意见（批注），按 fieldKey 分组，供题目旁展示
  const reviewQuery = useReviewItems(id);
  const reviewsByField = useMemo(() => {
    const map: Record<string, ReviewItem[]> = {};
    for (const it of reviewQuery.data?.items ?? []) {
      (map[it.fieldKey] ??= []).push(it);
    }
    return map;
  }, [reviewQuery.data]);

  if (isLoading) {
    if (id) {
      const errorText = draft.detail.isError
        ? `加载失败：${draft.detail.error?.message ?? "未知错误"}`
        : templateQuery.isError
          ? `加载模板失败：${templateQuery.error?.message ?? "未知错误"}`
          : "加载计划书…";
      return (
        <>
          <PortalHeader onOpenLogin={() => navigate("/")} />
          <div className="aup-app" style={{ minHeight: "calc(100vh - 64px)" }}>
            <div className="aup-empty">{errorText}</div>
          </div>
        </>
      );
    }
    if (publishedQuery.isError) {
      return (
        <>
          <PortalHeader onOpenLogin={() => navigate("/")} />
          <div className="aup-app" style={{ minHeight: "calc(100vh - 64px)" }}>
            <div className="aup-empty">
              <div style={{ color: "var(--danger)", fontWeight: 600, marginBottom: 12 }}>
                加载模板失败：{publishedQuery.error?.message ?? "未知错误"}
              </div>
              <button className="btn ghost" onClick={goBack}>← 返回上一页</button>
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        <PortalHeader onOpenLogin={() => navigate("/")} />
        <div className="aup-app" style={{ minHeight: "calc(100vh - 64px)" }}>
          <div className="aup-empty">加载计划书…</div>
        </div>
      </>
    );
  }

  // 无 id 且尚未发布模板：友好提示（而非卡在加载/失败）
  if (!id && !publishedQuery.data) {
    return (
      <>
        <PortalHeader onOpenLogin={() => navigate("/")} />
        <div className="aup-app" style={{ minHeight: "calc(100vh - 64px)" }}>
          <div className="aup-empty" style={{ maxWidth: 480, margin: "0 auto", paddingTop: 80 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>计划书模板尚未发布</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: 20 }}>
              管理员还未发布实验动物研究及使用计划（AUP）模板，暂时无法填写计划书。请稍后再试，或联系管理员发布模板。
            </p>
            <button className="btn ghost" onClick={goBack}>← 返回上一页</button>
          </div>
        </div>
      </>
    );
  }

  // 无 id：先显示内容提示缓冲页，点「进入填写」才渲染表单（仍不创建后端 id）
  if (!id && !entered) {
    return (
      <>
        <PortalHeader onOpenLogin={() => navigate("/")} />
        <div className="aup-app" style={{ minHeight: "calc(100vh - 64px)" }}>
          <div className="aup-landing">
            <button className="btn ghost" onClick={goBack} style={{ margin: "0 0 16px 0" }}>← 返回</button>
            <h2>实验动物研究及使用计划（AUP）</h2>
            {publishedQuery.data?.description && (
              <div className="aup-landing-desc" dangerouslySetInnerHTML={{ __html: publishedQuery.data.description }} />
            )}
            <button className="btn primary" onClick={() => setEntered(true)} style={{ display: "block", margin: "0 auto" }}>进入填写</button>
          </div>
        </div>
      </>
    );
  }

  const sections = rawSections!;

  // 首次保存：创建后端记录（冻结模板）+ 写入内容，返回新 id。
  // 关键：只有用户主动「保存到草稿箱」才生成后端 id，进入页面/本地填写不产生记录。
  const persistFirstDraft = async (): Promise<string> => {
    const res = await createMut.mutateAsync({});
    if (!res?.id) throw new Error("创建草稿失败");
    await saveAup(res.id, { dataJson: JSON.stringify(effectiveValues), expectedVersion: 0 });
    return res.id;
  };

  const handleSelect = (sid: string) => {
    setActiveId(sid);
    const el =
      document.getElementById(`aup-subsection-${sid}`) ?? document.getElementById(`aup-section-${sid}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 返回上一页：有未保存修改时先弹确认框，否则直接返回
  const handleBack = () => {
    if (draft.isDirty) setExitDialog(true);
    else goBack();
  };

  const handleSaveAndExit = async () => {
    setSavingExit(true);
    try {
      if (id) await draft.flushSave();
      else await persistFirstDraft();
      goBack();
    } catch (e) {
      if (isConflict(e)) {
        toast.error("草稿已在其他端修改，请刷新后再试");
        setExitDialog(false);
      } else {
        toast.error("保存失败：" + (e as Error).message);
      }
      setSavingExit(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (id) {
        await draft.flushSave();
        toast.success("已保存");
      } else {
        const newId = await persistFirstDraft();
        toast.success("已保存到草稿箱");
        navigate(`/aup/fill/${newId}`, { replace: true });
      }
    } catch (e) {
      if (isConflict(e)) {
        if (id && confirm("草稿已在其他端修改，是否刷新加载最新内容？")) draft.detail.refetch();
        else toast.error("草稿已在其他端修改，请刷新后重试");
      } else {
        toast.error("保存失败：" + (e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const targetId = id ?? (await persistFirstDraft());
      // 已有 id 的草稿：先把防抖中未保存的编辑落盘，避免校验/提交拿到服务端旧数据丢最后一笔
      if (id) await draft.flushSave();
      // 提交前预检：拿到错误字段，红框高亮提示，有错则不提交
      const errors = await fetchAupValidate(targetId);
      if (errors.length > 0) {
        setErrorKeys(new Set(errors.map((e) => e.fieldKey)));
        setValidationErrors(errors.map((e) => ({ fieldKey: e.fieldKey, message: e.message })));
        setValidationOpen(true);
        return;
      }
      setErrorKeys(new Set());
      await submitAup(targetId);
      toast.success("已提交");
      navigate("/console/admin/aup");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isConflict(e)) {
        if (id && confirm("草稿已在其他端修改，是否刷新加载最新内容？")) draft.detail.refetch();
        else toast.error("草稿已在其他端修改，请刷新后重试");
      } else if (/校验未通过/i.test(msg)) {
        setValidationErrors([{ fieldKey: "", message: msg }]);
        setValidationOpen(true);
      } else if (/SIGNATURE_REQUIRED/i.test(msg)) {
        toast.error("请先完成课题组长手写签名后再提交");
      } else {
        toast.error("提交失败：" + msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    if (!id) return;
    try {
      const data = await fetchAupPrintData(id);
      const w = window.open("", "_blank", "width=900,height=700");
      if (!w) {
        toast.error("请允许弹出窗口以打印");
        return;
      }
      w.document.write('<html><head><meta charset="utf-8"><title>AUP 打印</title></head>');
      w.document.write('<body style="font-family:sans-serif;padding:24px">');
      w.document.write("<h2>实验动物研究及使用计划（AUP）</h2>");
      if (data.registerNo) w.document.write(`<p>注册号：<b>${escapeHtml(data.registerNo)}</b></p>`);
      w.document.write(`<pre style="white-space:pre-wrap;font-size:12px">${escapeHtml(JSON.stringify(data.core ?? {}, null, 2))}</pre>`);
      w.document.write("</body></html>");
      w.document.close();
      w.focus();
      w.print();
    } catch (e) {
      toast.error("打印失败：" + (e as Error).message);
    }
  };

  const renderField = (f: FormFieldDef) => {
    const reviews = reviewsByField[f.fieldKey];
    return (
      <div key={f.fieldKey}>
        {reviews && reviews.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            <FieldReviewTag fieldKey={f.fieldKey} fieldLabel={f.label} editable={false} existing={reviews} />
          </div>
        )}
        <FormField
          field={f}
          value={effectiveValues[f.fieldKey]}
          values={effectiveValues}
          onChange={draft.updateValue}
          readOnly={readOnly}
          aupId={id}
          error={errorKeys.has(f.fieldKey)}
        />
      </div>
    );
  };

  const renderSubSection = (sub: FormSubSection) => {
    if (sub.showWhen && !evaluateShowWhen(sub.showWhen, effectiveValues)) return null;
    return (
      <div key={sub.code} id={`aup-subsection-${sub.code}`} className="aup-subsection">
        <div className="aup-subhead">{displayTitle(sub.code, sub.label)}</div>
        {sub.description && <div className="aup-subdesc">{sub.description}</div>}
        {(sub.fields ?? []).map(renderField)}
      </div>
    );
  };

  const renderSection = (section: FormSection) => {
    if (section.showWhen && !evaluateShowWhen(section.showWhen, effectiveValues)) return null;
    const subs = section.subdivisible ? section.subsections : undefined;
    return (
      <section
        key={section.code}
        id={`aup-section-${section.code}`}
        data-section-id={section.code}
        className={"card aup-section" + (section.highlight ? " aup-section-highlight" : "")}
      >
        <h2>{displayTitle(section.code, section.label)}</h2>
        {subs && subs.length > 0 && (
          <div className="sub">{subs.map((s) => displayTitle(s.code, s.label)).join(" · ")}</div>
        )}
        {subs ? subs.map(renderSubSection) : (section.fields ?? []).map(renderField)}
      </section>
    );
  };

  return (
    <>
      <PortalHeader onOpenLogin={() => navigate("/")} />
      <div className="aup-app" style={{ minHeight: "calc(100vh - 64px)" }}>

      <Toolbar
        onBack={handleBack}
        templateName={templateName}
        autosaveState={draft.autosaveState}
        isNew={!id}
        readOnly={readOnly}
        onSave={handleSave}
        saving={saving}
        onSubmit={handleSubmit}
        submitting={saving}
        canSave={hasContent}
        canSubmit={canSubmit}
        onOpenAttachments={id ? () => setAttachOpen((v) => !v) : undefined}
        onPrint={id ? handlePrint : undefined}
      />

      <StageStepper currentStage={currentStage} draftSource={record?.draftSource} />

      {attachOpen && id && <AttachmentPanel aupId={id} onClose={() => setAttachOpen(false)} />}

      <div className="layout">
        <SectionNav sections={sections} values={effectiveValues} activeId={activeId} onSelect={handleSelect} errorKeys={errorKeys} />
        <main className="main">{sections.map(renderSection)}</main>
        <TracePanel traces={tracesQuery.data ?? []} />
      </div>

      <SnapshotDrawer open={snapOpen} aupId={id} onClose={() => setSnapOpen(false)} />

      {exitDialog && (
        <div className="aup-modal-mask" onClick={() => setExitDialog(false)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>有未保存的修改</h3>
            <p>当前计划书有尚未保存的内容，退出前请选择如何处理。</p>
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setExitDialog(false)}>继续编辑</button>
              <button className="btn primary" onClick={handleSaveAndExit} disabled={savingExit}>
                {savingExit ? "保存中…" : "保存并退出"}
              </button>
              <button
                className="btn ghost"
                style={{ color: "var(--danger, #dc2626)" }}
                onClick={goBack}
              >
                放弃退出
              </button>
            </div>
          </div>
        </div>
      )}
      {validationOpen && (
        <div className="aup-modal-mask" onClick={() => setValidationOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3>校验未通过</h3>
            <div className="aup-validation-list">
              {validationErrors.length === 0 ? (
                <p>存在未通过的校验项，请修正后重新提交。</p>
              ) : (
                validationErrors.map((err, i) => (
                  <div key={i} className="aup-validation-item">{err.message}</div>
                ))
              )}
            </div>
            <div className="aup-modal-actions">
              <button className="btn primary" onClick={() => setValidationOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
      <ScrollButtons />
      </div>
    </>
  );
}

/* ---------- 附件面板（复用 useAupAttachments） ---------- */
function AttachmentPanel({ aupId, onClose }: { aupId: string; onClose: () => void }) {
  const { listQuery, uploadMutation, deleteMutation, download } = useAupAttachments(aupId);
  const files = listQuery.data ?? [];

  const doDownload = async (fileId: number) => {
    try {
      const { blob, fileName } = await download(fileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* 已由 hook toast */
    }
  };

  return (
    <div className="attach-panel">
      <div className="attach-inner">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <b style={{ fontSize: 13 }}>附件（{files.length}）</b>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="btn ghost small" style={{ cursor: "pointer" }}>
              {uploadMutation.isPending ? "上传中…" : "＋ 上传"}
              <input
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadMutation.mutate(file);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn ghost small" onClick={onClose}>收起</button>
          </div>
        </div>
        {files.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted)" }}>暂无附件</div>
        ) : (
          files.map((f) => (
            <div key={f.fileId} className="attach-row">
              <span className="name">{f.fileName}</span>
              <span className="size">{(f.size / 1024).toFixed(1)} KB</span>
              <button type="button" className="icon-btn" title="下载" onClick={() => doDownload(f.fileId)}>↓</button>
              <button
                type="button"
                className="icon-btn"
                title="删除"
                onClick={() => deleteMutation.mutate(f.fileId)}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
