/**
 * 事件驱动可填表单启动器（V2）：按「事件（访视时点）→ 该事件指派的表单」列出，
 * 每个表单带 captureForm（采集形态）与草稿/新建入口。数据读 crf_visit_plan。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { createNhpRecordForProject, type NhpRecordListItem } from "../api/nhpRecord.api";
import {
  assignableFormId,
  fetchAssignableNhpTemplates,
  fillableFormId,
  indexTemplatesByFormId,
  type NhpTemplateListItem,
} from "../api/nhpTemplate.api";
import {
  CAPTURE_FORM_OPTIONS,
  fetchNhpVisits,
  fetchNhpVisitPlans,
  type NhpVisit,
  type NhpVisitPlan,
} from "../api/nhpVisit.api";
import "../nhp.css";

type Props = {
  projectId: number;
  records: NhpRecordListItem[];
  mode?: "portal" | "adminPreview";
  onCreated?: (recordId: number) => void;
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

export default function NhpSurgeryFormLauncher({ projectId, records, mode = "portal", onCreated }: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const isAdmin = mode === "adminPreview";

  const visitsQuery = useQuery({ queryKey: ["nhp", "visits"], queryFn: () => fetchNhpVisits() });
  const plansQuery = useQuery({ queryKey: ["nhp", "visit-plans"], queryFn: fetchNhpVisitPlans });
  const formsQuery = useQuery({
    queryKey: ["nhp", "assignable-templates"],
    queryFn: fetchAssignableNhpTemplates,
  });

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

  // 事件（按 seq 排序）→ 该事件指派的表单
  const eventRows = useMemo(() => {
    const plansByVisit = new Map<number, NhpVisitPlan[]>();
    for (const p of plans) {
      const list = plansByVisit.get(p.visitId) ?? [];
      list.push(p);
      plansByVisit.set(p.visitId, list);
    }
    return [...visits]
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
      .map((visit) => {
        const visitPlans = plansByVisit.get(visit.id) ?? [];
        const assignedForms = visitPlans
          .map((plan) => {
            const form = formById.get(plan.atomId);
            if (!form) return null;
            const draft = draftByFormKey.get(form.formKey);
            return { form, plan, draft };
          })
          .filter((x): x is NonNullable<typeof x> => x != null);
        return { visit, forms: assignedForms };
      })
      .filter((e) => e.forms.length > 0);
  }, [visits, plans, formById, draftByFormKey]);

  const fillPath = (id: number, formKey?: string, captureForm?: string | null) => {
    const q = new URLSearchParams();
    if (formKey) q.set("formKey", formKey);
    if (captureForm) q.set("captureForm", captureForm);
    const qs = q.toString();
    const base = isAdmin ? `/content-manager/nhp-entry/${id}` : `/nhp/fill/${id}`;
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
      const r = await createNhpRecordForProject(projectId, formId);
      toast.success(`已创建「${form.title || form.formKey}」实例`);
      onCreated?.(r.id);
      navigate(fillPath(r.id, form.formKey, captureForm));
    } catch (e) {
      toast.error((e as Error).message || "创建实例失败");
    } finally {
      setBusy(null);
    }
  };

  if (eventRows.length === 0) {
    return (
      <div className="nhp-form-launcher-empty">
        <div className="nhp-form-launcher-empty-title">暂无事件指派</div>
        <p>
          还没有把表单指派到任何事件。请在管理端「事件指派」页配置（事件 → 该事件该采集的表单），
          或先发布原子/组合模板。
        </p>
      </div>
    );
  }

  return (
    <div className="nhp-form-launcher">
      {eventRows.map(({ visit, forms }) => (
        <div key={visit.id} className="nhp-form-launcher-section">
          <div className="nhp-form-launcher-section-hd">
            <h3>
              {visit.code}
              {visit.name ? ` · ${visit.name}` : ""}
            </h3>
            <span>{forms.length} 个表单</span>
          </div>
          <div className="nhp-form-launcher-list">
            {forms.map(({ form, plan, draft }) => (
              <div key={`${plan.id ?? form.formId}`} className="nhp-form-launcher-row">
                <div className="nhp-form-launcher-main">
                  <div className="nhp-form-launcher-title">
                    <span className="nhp-form-launcher-badge">{captureFormLabel(plan.captureForm)}</span>
                    {form.title || form.formKey}
                  </div>
                  <div className="nhp-form-launcher-hint">
                    {draft ? `有草稿可续填 · ${statusShort(draft.record.status)}` : "可新建实例"}
                  </div>
                </div>
                <div className="nhp-form-launcher-acts">
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
                    {draft ? "新建实例" : busy === form.formKey ? "创建中…" : "开始填写"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
