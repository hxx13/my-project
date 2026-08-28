import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createNhpRecordForProject,
  deleteNhpRecord,
  fetchNhpProjectRecords,
  updateNhpProject,
  type NhpProject,
} from "../api/nhpRecord.api";
import {
  assignableFormId,
  fetchAssignableNhpTemplates,
  indexTemplatesByFormId,
  type NhpTemplateListItem,
} from "../api/nhpTemplate.api";
import { fetchNhpProjectVisitPlans, fetchNhpProjectVisitScheme, fetchNhpVisits, type NhpProjectVisitPlan } from "../api/nhpVisit.api";

export function useNhpProjectWorkspace(project: NhpProject | null, mode: "portal" | "adminPreview" = "portal") {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedTp, setSelectedTp] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTp, setDraftTp] = useState<string | null>(project?.currentTp ?? null);
  const [draftLock, setDraftLock] = useState<boolean>(project?.stageLock === true);

  const projectSchemeQuery = useQuery({
    queryKey: ["nhp", "project-visit-scheme", project?.id],
    queryFn: () => fetchNhpProjectVisitScheme(project!.id),
    enabled: project != null,
  });
  const visitsQuery = useQuery({
    queryKey: ["nhp", "visits", projectSchemeQuery.data ?? null],
    queryFn: () => fetchNhpVisits(projectSchemeQuery.data ?? null),
  });
  const plansQuery = useQuery({
    queryKey: ["nhp", "project-visit-plans", project?.id],
    queryFn: () => fetchNhpProjectVisitPlans(project!.id),
    enabled: project != null,
  });
  const formsQuery = useQuery({ queryKey: ["nhp", "assignable-templates"], queryFn: fetchAssignableNhpTemplates });
  const recordsQuery = useQuery({
    queryKey: ["nhp", "project-records", project?.id],
    queryFn: () => fetchNhpProjectRecords(project!.id),
    enabled: project != null,
  });

  const visits = useMemo(() => [...(visitsQuery.data ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)), [visitsQuery.data]);
  const plans = plansQuery.data ?? [];
  const formById = useMemo(() => indexTemplatesByFormId(formsQuery.data ?? []), [formsQuery.data]);
  const records = recordsQuery.data?.items ?? [];

  const plansByVisit = useMemo(() => {
    const m = new Map<number, NhpProjectVisitPlan[]>();
    for (const p of plans) {
      const list = m.get(p.visitId) ?? [];
      list.push(p);
      m.set(p.visitId, list);
    }
    return m;
  }, [plans]);

  const activeTp = selectedTp ?? project?.currentTp ?? visits[0]?.code ?? null;
  const activeVisit = visits.find((v) => v.code === activeTp) ?? null;

  const saveStageMut = useMutation({
    mutationFn: (body: { currentTp?: string | null; stageLock?: boolean }) => updateNhpProject(project!.id, body),
    onSuccess: () => {
      toast.success("进度已保存");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["nhp", "project", project?.id] });
      qc.invalidateQueries({ queryKey: ["nhp", "projects"] });
    },
    onError: (e: Error) => toast.error(e.message || "保存失败", { duration: 6000 }),
  });

  const activeForms = useMemo(() => {
    if (!activeVisit) return [];
    return (plansByVisit.get(activeVisit.id) ?? [])
      .map((plan) => ({ plan, form: formById.get(plan.atomId) }))
      .filter((x): x is { plan: NhpProjectVisitPlan; form: NhpTemplateListItem } => !!x.form)
      .sort((a, b) => (a.plan.sortOrder ?? 0) - (b.plan.sortOrder ?? 0));
  }, [activeVisit, plansByVisit, formById]);

  /** formKey → 该表单在本项目的全部实例（同一表单可反复「新建」多条记录）。 */
  const recordsByFormKey = useMemo(() => {
    const m = new Map<string, { id: number; status: string; subjectCode?: string; subjectType?: string }[]>();
    for (const it of records) {
      const key = it.formCode || String(it.record.formId);
      const list = m.get(key) ?? [];
      list.push({
        id: it.record.id,
        status: it.record.status ?? "",
        subjectCode: it.subject?.subjectCode,
        subjectType: it.subject?.subjectType,
      });
      m.set(key, list);
    }
    return m;
  }, [records]);

  const fillPath = (id: number, formKey?: string, captureForm?: string | null) => {
    const q = new URLSearchParams();
    if (formKey) q.set("formKey", formKey);
    if (captureForm) q.set("captureForm", captureForm);
    const qs = q.toString();
    const base = mode === "adminPreview" ? `/content-manager/nhp-entry/${id}` : `/nhp/fill/${id}`;
    return qs ? `${base}?${qs}` : base;
  };

  const onCreate = async (form: NhpTemplateListItem, captureForm?: string | null) => {
    if (!project) return;
    const formId = assignableFormId(form);
    setBusy(form.formKey);
    try {
      const r = await createNhpRecordForProject(project.id, formId);
      toast.success(`已创建实例 #${r.id}`);
      navigate(fillPath(r.id, form.formKey, captureForm));
    } catch (e) {
      toast.error((e as Error).message || "创建实例失败");
    } finally {
      setBusy(null);
    }
  };

  const deleteRecordMut = useMutation({
    mutationFn: (recordId: number) => deleteNhpRecord(recordId),
    onSuccess: () => {
      toast.success("已删除实例");
      qc.invalidateQueries({ queryKey: ["nhp", "project-records", project?.id] });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
  });

  const loading = visitsQuery.isLoading || plansQuery.isLoading || formsQuery.isLoading || recordsQuery.isLoading;

  return {
    project,
    visits,
    plansByVisit,
    activeTp,
    activeVisit,
    activeForms,
    recordsByFormKey,
    selectedTp,
    setSelectedTp,
    busy,
    loading,
    onCreate,
    deleteRecord: deleteRecordMut.mutate,
    fillPath,
    editing,
    setEditing,
    draftTp,
    setDraftTp,
    draftLock,
    setDraftLock,
    saveStageMut,
  };
}
