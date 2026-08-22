/**
 * NHP 表单-事件指派矩阵（对齐 REDCap "Designate Instruments for Events"）。
 * 行 = 已发布表单（原子/组合）；列 = 事件（访视时点）；格 = 是否指派。
 * 支持行/列批量勾选；数据落 crf_visit_plan（V38）。
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  fetchNhpVisits,
  fetchNhpVisitPlans,
  saveNhpVisitPlan,
  type NhpVisit,
} from "../../api/nhpVisit.api";
import {
  assignableFormId,
  fetchAssignableNhpTemplates,
  isCompositeTemplate,
  type NhpTemplateListItem,
} from "../../api/nhpTemplate.api";
import "../../nhp.css";

export default function NhpEventAssignmentPage() {
  const goBack = useGoBack("/content-manager/nhp-visits");
  const queryClient = useQueryClient();

  const visitsQuery = useQuery({ queryKey: ["nhp", "visits"], queryFn: fetchNhpVisits });
  const formsQuery = useQuery({ queryKey: ["nhp", "assignable-templates"], queryFn: fetchAssignableNhpTemplates });
  const plansQuery = useQuery({ queryKey: ["nhp", "visit-plans"], queryFn: fetchNhpVisitPlans });

  const visits = useMemo(
    () => [...(visitsQuery.data ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    [visitsQuery.data],
  );
  const forms = formsQuery.data ?? [];
  const plans = plansQuery.data ?? [];

  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  const cellKey = (visitId: number, formId: number) => `${visitId}:${formId}`;

  // plans → assigned（加载时回填）
  useEffect(() => {
    const next = new Set<string>();
    for (const p of plans) next.add(cellKey(p.visitId, p.atomId));
    setAssigned(next);
  }, [plans]);

  const toggleCell = (visitId: number, formId: number) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      const k = cellKey(visitId, formId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  /** 行批量：把一张表单指派到/取消所有事件 */
  const toggleRow = (formId: number) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      const ks = visits.map((v) => cellKey(v.id, formId));
      const allOn = ks.every((k) => next.has(k));
      ks.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  /** 列批量：把一个事件指派到/取消所有表单 */
  const toggleCol = (visitId: number) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      const ks = forms.map((f) => cellKey(visitId, assignableFormId(f)));
      const allOn = ks.every((k) => next.has(k));
      ks.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let changed = 0;
      for (const v of visits) {
        const atoms = forms
          .filter((f) => assigned.has(cellKey(v.id, assignableFormId(f))))
          .map((f) => ({ atomId: assignableFormId(f), required: true }));
        await saveNhpVisitPlan(v.id, atoms);
        changed++;
      }
      return changed;
    },
    onSuccess: (changed) => {
      toast.success(`已保存 ${changed} 个事件的指派`);
      void queryClient.invalidateQueries({ queryKey: ["nhp", "visit-plans"] });
    },
    onError: (e) => toast.error((e as Error).message || "保存失败"),
  });

  const rowState = (formId: number) => {
    const ks = visits.map((v) => cellKey(v.id, formId));
    const on = ks.filter((k) => assigned.has(k)).length;
    return on === 0 ? "none" : on === ks.length ? "all" : "some";
  };
  const colState = (visitId: number) => {
    const ks = forms.map((f) => cellKey(visitId, assignableFormId(f)));
    const on = ks.filter((k) => assigned.has(k)).length;
    return on === 0 ? "none" : on === ks.length ? "all" : "some";
  };

  const totalCells = visits.length * forms.length;
  const onCells = assigned.size;

  return (
    <div className="nhp-assign-page" style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div className="nhp-assign-hd" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button type="button" className="btn ghost small" onClick={goBack}>
          ← 返回
        </button>
        <h2 style={{ fontSize: 18, margin: 0 }}>表单-事件指派</h2>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          行=表单 · 列=事件；勾选格子 = 该事件采集该表单。点行头/列头批量。
        </span>
      </div>

      {forms.length === 0 ? (
        <div className="aup-wb-empty" style={{ padding: 40 }}>
          暂无已发布表单。请先在「模板发布」页发布原子或组合模板。
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "auto", maxHeight: "calc(100vh - 160px)" }}>
          <table className="nhp-assign-matrix" style={{ borderCollapse: "collapse", width: "100%", minWidth: 720, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, top: 0, zIndex: 3, background: "var(--bg-weak)", minWidth: 220, textAlign: "left", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                  表单 \ 事件（已指派 {onCells}/{totalCells}）
                </th>
                {visits.map((v) => (
                  <th key={v.id} style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg-weak)", padding: "6px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    <div style={{ fontWeight: 700 }}>{v.code}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name || "—"}</div>
                    <input
                      type="checkbox"
                      checked={colState(v.id) === "all"}
                      ref={(el) => {
                        if (el) el.indeterminate = colState(v.id) === "some";
                      }}
                      onChange={() => toggleCol(v.id)}
                      title="批量勾选该事件所有表单"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => {
                const fid = assignableFormId(f);
                return (
                  <tr key={fid}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: "#fff", padding: "6px 12px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={rowState(fid) === "all"}
                          ref={(el) => {
                            if (el) el.indeterminate = rowState(fid) === "some";
                          }}
                          onChange={() => toggleRow(fid)}
                          title="批量勾选该表单到所有事件"
                        />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.title || f.formKey}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>
                            {isCompositeTemplate(f) ? "组合" : "原子"} · {f.formKey}
                          </div>
                        </div>
                      </div>
                    </td>
                    {visits.map((v) => {
                      const k = cellKey(v.id, fid);
                      const on = assigned.has(k);
                      return (
                        <td key={v.id} style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: on ? "var(--primary-weak)" : "transparent" }} onClick={() => toggleCell(v.id, fid)}>
                          <input type="checkbox" readOnly checked={on} style={{ pointerEvents: "none" }} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn ghost small" disabled={saveMutation.isPending} onClick={() => queryClient.invalidateQueries({ queryKey: ["nhp", "visit-plans"] })}>
          重置
        </button>
        <button type="button" className="btn primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "保存中…" : "保存全部指派"}
        </button>
      </div>
    </div>
  );
}
