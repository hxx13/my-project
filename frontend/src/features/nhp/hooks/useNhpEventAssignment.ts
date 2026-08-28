import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { assignableFormId, fetchAssignableNhpTemplates } from "../api/nhpTemplate.api";
import {
  fetchNhpProjectVisitPlans,
  fetchNhpVisitPlans,
  fetchNhpVisits,
  saveNhpProjectVisitPlan,
  saveNhpVisitPlan,
} from "../api/nhpVisit.api";
import {
  assignmentCellKey,
  colKeys,
  computeMatrixStats,
  computeTriState,
  isAssignmentDirty,
  plansToAssignedSet,
  rowKeys,
} from "../event-assignment/eventAssignment.utils";
import type { AssignmentCellKey, AssignmentTriState } from "../event-assignment/eventAssignment.types";

export const nhpEventAssignmentKeys = {
  visits: ["nhp", "visits"] as const,
  assignableTemplates: ["nhp", "assignable-templates"] as const,
  visitPlans: ["nhp", "visit-plans"] as const,
};

export function useNhpEventAssignment(projectId?: number | null, schemeId?: number | null) {
  const queryClient = useQueryClient();

  const visitsQuery = useQuery({
    queryKey: ["nhp", "visits", schemeId ?? null],
    queryFn: () => fetchNhpVisits(schemeId ?? null),
  });
  const formsQuery = useQuery({
    queryKey: nhpEventAssignmentKeys.assignableTemplates,
    queryFn: fetchAssignableNhpTemplates,
  });
  // 选中项目 → 读写项目级编排；否则读写全局 crf_visit_plan
  const plansQuery = useQuery({
    queryKey: ["nhp", "visit-plans", projectId ?? "global"],
    queryFn: () => (projectId != null ? fetchNhpProjectVisitPlans(projectId) : fetchNhpVisitPlans()),
    enabled: projectId != null ? !!projectId : true,
  });

  const visits = useMemo(
    () => [...(visitsQuery.data ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
    [visitsQuery.data],
  );
  const forms = formsQuery.data ?? [];
  const plans = plansQuery.data ?? [];

  const [assigned, setAssigned] = useState<Set<AssignmentCellKey>>(new Set());
  const [lastSavedAt, setLastSavedAt] = useState(0);

  useEffect(() => {
    setAssigned(plansToAssignedSet(plans));
  }, [plans]);

  const toggleCell = useCallback((visitId: number, formId: number) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      const k = assignmentCellKey(visitId, formId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const toggleRow = useCallback(
    (formId: number) => {
      setAssigned((prev) => {
        const next = new Set(prev);
        const ks = rowKeys(formId, visits);
        const allOn = ks.every((k) => next.has(k));
        ks.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
        return next;
      });
    },
    [visits],
  );

  const toggleCol = useCallback(
    (visitId: number) => {
      setAssigned((prev) => {
        const next = new Set(prev);
        const ks = colKeys(visitId, forms);
        const allOn = ks.every((k) => next.has(k));
        ks.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
        return next;
      });
    },
    [forms],
  );

  const reset = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["nhp", "visit-plans", projectId ?? "global"] });
  }, [queryClient, projectId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let changed = 0;
      for (const v of visits) {
        const atoms = forms
          .filter((f) => assigned.has(assignmentCellKey(v.id, assignableFormId(f))))
          .map((f) => ({ atomId: assignableFormId(f), required: true }));
        if (projectId != null) {
          await saveNhpProjectVisitPlan(projectId, v.id, atoms);
        } else {
          await saveNhpVisitPlan(v.id, atoms);
        }
        changed++;
      }
      return changed;
    },
    onSuccess: (changed) => {
      toast.success(`已保存 ${changed} 个事件的指派`);
      setLastSavedAt(Date.now());
      void queryClient.invalidateQueries({ queryKey: ["nhp", "visit-plans", projectId ?? "global"] });
    },
    onError: (e) => toast.error((e as Error).message || "保存失败"),
  });

  const rowState = useCallback(
    (formId: number): AssignmentTriState =>
      computeTriState(
        visits.map((v) => assignmentCellKey(v.id, formId)),
        assigned,
      ),
    [visits, assigned],
  );

  const colState = useCallback(
    (visitId: number): AssignmentTriState =>
      computeTriState(colKeys(visitId, forms), assigned),
    [forms, assigned],
  );

  const stats = useMemo(
    () => computeMatrixStats(visits, forms, assigned),
    [visits, forms, assigned],
  );

  const isDirty = useMemo(() => isAssignmentDirty(assigned, plans), [assigned, plans]);

  const isLoading = visitsQuery.isLoading || formsQuery.isLoading || plansQuery.isLoading;
  const isError = visitsQuery.isError || formsQuery.isError || plansQuery.isError;

  return {
    visits,
    forms,
    plans,
    assigned,
    stats,
    isDirty,
    isLoading,
    isError,
    toggleCell,
    toggleRow,
    toggleCol,
    rowState,
    colState,
    reset,
    save: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    lastSavedAt,
  };
}
