/**
 * 驾驶舱主区 · 当前可填表单（紧凑单组件，访视名 + 表单标题，不突出 TP 码）
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { createNhpRecord, type NhpRecordListItem } from "../api/nhpRecord.api";
import {
  fetchAssignableNhpTemplates,
  fillableFormId,
  indexTemplatesByFormId,
  type NhpTemplateListItem,
} from "../api/nhpTemplate.api";
import {
  CAPTURE_FORM_OPTIONS,
  fetchNhpVisits,
  fetchNhpVisitPlans,
  type NhpVisitPlan,
} from "../api/nhpVisit.api";
import type { NhpSurgeryContext } from "../utils/nhpSurgeryContext";
import "../nhp.css";

type Props = {
  surgery: NhpSurgeryContext;
  records: NhpRecordListItem[];
  mode?: "portal" | "adminPreview";
  onCreated?: (recordId: number) => void;
};

type FormRow = {
  visitName: string;
  visitCode: string;
  isCurrent: boolean;
  form: NhpTemplateListItem;
  plan: NhpVisitPlan;
  draft?: NhpRecordListItem;
};

function statusShort(status?: string | null): string {
  const s = (status ?? "").toUpperCase();
  if (s === "LOCKED") return "已锁定";
  if (s === "COMPLETE") return "已提交";
  if (s === "DRAFT") return "草稿";
  return status || "—";
}

function captureFormLabel(cf?: string | null): string {
  return CAPTURE_FORM_OPTIONS.find((o) => o.value === cf)?.label ?? cf ?? "事件面板";
}

export default function NhpOverviewFillablePanel({ surgery, records, mode = "portal", onCreated }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = mode === "adminPreview";

  const visitsQuery = useQuery({ queryKey: ["nhp", "visits"], queryFn: () => fetchNhpVisits() });
  const plansQuery = useQuery({ queryKey: ["nhp", "visit-plans"], queryFn: fetchNhpVisitPlans });
  const formsQuery = useQuery({ queryKey: ["nhp", "assignable-templates"], queryFn: fetchAssignableNhpTemplates });

  const visits = visitsQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const forms = formsQuery.data ?? [];
  const formById = useMemo(() => indexTemplatesByFormId(forms), [forms]);

  const draftByFormKey = useMemo(() => {
    const m = new Map<string, NhpRecordListItem>();
    for (const r of records) {
      const key = r.formCode || String(r.record.formId);
      const s = (r.record.status ?? "").toUpperCase();
      if ((s === "DRAFT" || s === "IN_REVIEW" || s === "") && !m.has(key)) {
        m.set(key, r);
      }
    }
    return m;
  }, [records]);

  const rows = useMemo((): FormRow[] => {
    const plansByVisit = new Map<number, NhpVisitPlan[]>();
    for (const p of plans) {
      const list = plansByVisit.get(p.visitId) ?? [];
      list.push(p);
      plansByVisit.set(p.visitId, list);
    }
    const out: FormRow[] = [];
    for (const visit of [...visits].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
      const visitPlans = plansByVisit.get(visit.id) ?? [];
      const visitName = visit.name?.trim() || visit.code;
      const isCurrent = visit.code === surgery.currentTp;
      for (const plan of visitPlans) {
        const form = formById.get(plan.atomId);
        if (!form) continue;
        out.push({
          visitName,
          visitCode: visit.code,
          isCurrent,
          form,
          plan,
          draft: draftByFormKey.get(form.formKey),
        });
      }
    }
    return out;
  }, [visits, plans, formById, draftByFormKey, surgery.currentTp]);

  const currentRows = useMemo(() => rows.filter((r) => r.isCurrent), [rows]);
  const otherRows = useMemo(() => rows.filter((r) => !r.isCurrent), [rows]);
  const displayRows = currentRows.length > 0 ? [...currentRows, ...otherRows] : rows;

  const fillPath = (id: number, formKey?: string, captureForm?: string | null) => {
    const q = new URLSearchParams();
    if (formKey) q.set("formKey", formKey);
    if (captureForm) q.set("captureForm", captureForm);
    const qs = q.toString();
    const base = isAdmin ? `/nhp-admin/entry/${id}` : `/nhp/fill/${id}`;
    return qs ? `${base}?${qs}` : base;
  };

  const onCreate = async (form: NhpTemplateListItem, captureForm?: string | null) => {
    const formId = fillableFormId(form);
    if (formId == null) {
      toast.error("该表单未发布，无法开填");
      return;
    }
    setBusy(form.formKey);
    try {
      const r = await createNhpRecord(surgery.subjectId, formId);
      toast.success(`已创建实例 #${r.id}`);
      onCreated?.(r.id);
      navigate(fillPath(r.id, form.formKey, captureForm));
    } catch (e) {
      toast.error((e as Error).message || "创建实例失败");
    } finally {
      setBusy(null);
    }
  };

  const loading = visitsQuery.isLoading || plansQuery.isLoading || formsQuery.isLoading;

  return (
    <section className="nhp-cockpit-card nhp-cockpit-fillable">
      <header className="nhp-cockpit-card-hd">
        <div>
          <h3 className="nhp-cockpit-card-title">当前可填表单</h3>
          <p className="nhp-cockpit-card-sub">
            {currentRows.length > 0
              ? `当前阶段 ${currentRows[0]?.visitName ?? ""} · ${currentRows.length} 项`
              : `${displayRows.length} 项可填`}
          </p>
        </div>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => navigate(`/nhp/fill?subjectId=${surgery.subjectId}`)}
        >
          完整采集 →
        </button>
      </header>

      {loading ? (
        <div className="nhp-cockpit-card-empty">加载表单…</div>
      ) : displayRows.length === 0 ? (
        <div className="nhp-cockpit-fillable-empty">
          <p>暂无事件指派表单</p>
          <span>请在管理端「事件指派」配置访视 → 表单映射</span>
        </div>
      ) : (
        <div className="nhp-cockpit-fillable-list">
          {displayRows.map(({ visitName, visitCode, isCurrent, form, plan, draft }) => (
            <article
              key={`${plan.id ?? form.formId}-${visitCode}`}
              className={"nhp-cockpit-form-chip" + (isCurrent ? " current" : "")}
            >
              <div className="nhp-cockpit-form-chip-hd">
                <span className="nhp-cockpit-form-visit">{visitName}</span>
                <span className="nhp-cockpit-form-capture">{captureFormLabel(plan.captureForm)}</span>
              </div>
              <div className="nhp-cockpit-form-title">{form.title || form.formKey}</div>
              <div className="nhp-cockpit-form-hint">
                {draft ? `续填 · ${statusShort(draft.record.status)}` : "可新建"}
              </div>
              <div className="nhp-cockpit-form-acts">
                {draft ? (
                  <button
                    type="button"
                    className="btn primary small"
                    disabled={busy === form.formKey}
                    onClick={() => navigate(fillPath(draft.record.id, form.formKey, plan.captureForm))}
                  >
                    续填
                  </button>
                ) : null}
                <button
                  type="button"
                  className={draft ? "btn ghost small" : "btn primary small"}
                  disabled={busy === form.formKey}
                  onClick={() => onCreate(form, plan.captureForm)}
                >
                  {busy === form.formKey ? "…" : draft ? "新建" : "填写"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
