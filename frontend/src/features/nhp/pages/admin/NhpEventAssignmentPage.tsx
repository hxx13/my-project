/**
 * NHP 表单-事件指派矩阵（对齐 REDCap "Designate Instruments for Events"）。
 * 行 = 已发布表单（原子/组合）；列 = 事件（访视时点）；格 = 是否指派。
 */
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { EVENT_ASSIGNMENT_PAGE } from "../../event-assignment/eventAssignment.config";
import { useNhpEventAssignment } from "../../hooks/useNhpEventAssignment";
import { AssignmentMatrix } from "../../components/event-assignment/AssignmentMatrix";
import { AssignmentStatsBar } from "../../components/event-assignment/AssignmentStatsBar";
import { AssignmentToolbar } from "../../components/event-assignment/AssignmentToolbar";
import FormAccessCellPopup from "../../components/FormAccessCellPopup";
import { listAupFolders, type AupFolderVO } from "@/features/aup/api/aup.api";
import { fetchNhpProjects } from "../../api/nhpRecord.api";
import {
  createNhpVisit,
  createNhpVisitScheme,
  deleteNhpVisit,
  deleteNhpVisitScheme,
  fetchNhpProjectVisitScheme,
  fetchNhpVisitSchemes,
  saveNhpProjectVisitScheme,
  updateNhpVisit,
  updateNhpVisitScheme,
  type NhpVisit,
  type NhpVisitScheme,
} from "../../api/nhpVisit.api";
import "@/features/aup/aup.css";
import "../../nhp.css";

gsap.registerPlugin(useGSAP);

const NHP_FORM_OWNER = "NHP_FORM";

function flattenFolders(folders: AupFolderVO[]): AupFolderVO[] {
  const out: AupFolderVO[] = [];
  const walk = (list: AupFolderVO[], depth: number) => {
    for (const f of list) {
      out.push({ ...f, name: `${"　".repeat(depth)}${f.name}` });
      if (f.children?.length) walk(f.children, depth + 1);
    }
  };
  walk(folders ?? [], 0);
  return out;
}

function nextTpCode(visits: NhpVisit[]): string {
  let max = 0;
  for (const v of visits) {
    const m = v.code?.match(/^TP(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `TP${String(max + 1).padStart(2, "0")}`;
}

export default function NhpEventAssignmentPage() {
  const goBack = useGoBack(EVENT_ASSIGNMENT_PAGE.backPath);
  const pageRef = useRef<HTMLDivElement>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [schemeId, setSchemeId] = useState<number | null>(null);
  const qc = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ["aup", "folders", NHP_FORM_OWNER],
    queryFn: () => listAupFolders(NHP_FORM_OWNER),
  });

  const projectsQuery = useQuery({
    queryKey: ["nhp", "projects", "mine"],
    queryFn: () => fetchNhpProjects({ mine: true }),
    staleTime: 0,
  });

  const schemesQuery = useQuery({
    queryKey: ["nhp", "visit-schemes"],
    queryFn: fetchNhpVisitSchemes,
    staleTime: 0,
  });

  const projectSchemeQuery = useQuery({
    queryKey: ["nhp", "project-visit-scheme", projectId],
    queryFn: () => fetchNhpProjectVisitScheme(projectId!),
    enabled: projectId != null,
  });

  useEffect(() => {
    if (projectId == null) {
      setSchemeId(null);
      return;
    }
    if (projectSchemeQuery.isSuccess) setSchemeId(projectSchemeQuery.data);
  }, [projectId, projectSchemeQuery.isSuccess, projectSchemeQuery.data]);

  const saveSchemeMut = useMutation({
    mutationFn: (sid: number | null) => saveNhpProjectVisitScheme(projectId!, sid),
    onSuccess: () => {
      toast.success("已保存访视方案");
      void qc.invalidateQueries({ queryKey: ["nhp", "project-visit-scheme", projectId] });
    },
    onError: (e: Error) => toast.error(e.message || "保存方案失败"),
  });

  const invalidateVisits = () => {
    void qc.invalidateQueries({ queryKey: ["nhp", "visits"] });
    void qc.invalidateQueries({ queryKey: ["nhp", "visit-plans"] });
  };

  const addVisitMut = useMutation({
    mutationFn: (name: string) => createNhpVisit({ code: nextTpCode(visits), name, schemeId, seq: visits.length }),
    onSuccess: () => {
      toast.success("已添加时点，可在横轴重命名");
      invalidateVisits();
    },
    onError: (e: Error) => toast.error(e.message || "添加失败"),
  });

  const deleteVisitMut = useMutation({
    mutationFn: (id: number) => deleteNhpVisit(id),
    onSuccess: () => {
      toast.success("已删除时点");
      invalidateVisits();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const renameVisitMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateNhpVisit(id, { name }),
    onSuccess: () => {
      toast.success("已重命名");
      void qc.invalidateQueries({ queryKey: ["nhp", "visits"] });
    },
    onError: (e: Error) => toast.error(e.message || "重命名失败"),
  });

  const handleAddVisit = async () => {
    const name = (await appPrompt("新时点名", "新时点"))?.trim();
    if (!name) return;
    addVisitMut.mutate(name);
  };

  const handleDeleteVisit = async (visitId: number) => {
    const v = visits.find((x) => x.id === visitId);
    if (await appConfirm(`删除时点「${v?.code ?? visitId}」？该时点的指派会一并删除。`, { danger: true })) {
      deleteVisitMut.mutate(visitId);
    }
  };

  const handleRenameVisit = async (visitId: number) => {
    const v = visits.find((x) => x.id === visitId);
    const name = (await appPrompt("时点名", v?.name ?? ""))?.trim();
    if (!name || name === v?.name) return;
    renameVisitMut.mutate({ id: visitId, name });
  };

  const moveVisitMut = useMutation({
    mutationFn: async ({ id, dir }: { id: number; dir: -1 | 1 }) => {
      const sorted = [...visits].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      const idx = sorted.findIndex((v) => v.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[j];
      await updateNhpVisit(a.id, { seq: b.seq ?? 0 });
      await updateNhpVisit(b.id, { seq: a.seq ?? 0 });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nhp", "visits"] }),
    onError: (e: Error) => toast.error(e.message || "移动失败"),
  });

  const insertAfterMut = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const sorted = [...visits].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      const idx = sorted.findIndex((v) => v.id === id);
      if (idx < 0) return;
      const target = sorted[idx];
      const newSeq = (target.seq ?? 0) + 1;
      await Promise.all(sorted.slice(idx + 1).map((v) => updateNhpVisit(v.id, { seq: (v.seq ?? 0) + 1 })));
      await createNhpVisit({ code: nextTpCode(sorted), name, schemeId, seq: newSeq });
    },
    onSuccess: () => {
      toast.success("已插入时点");
      invalidateVisits();
    },
    onError: (e: Error) => toast.error(e.message || "插入失败"),
  });

  const handleMoveVisit = (visitId: number, dir: -1 | 1) => {
    moveVisitMut.mutate({ id: visitId, dir });
  };

  const handleInsertAfter = async (visitId: number) => {
    const name = (await appPrompt("新时点名", "新时点"))?.trim();
    if (!name) return;
    insertAfterMut.mutate({ id: visitId, name });
  };

  const createSchemeMut = useMutation({
    mutationFn: (name: string) => createNhpVisitScheme(name),
    onSuccess: (s) => {
      toast.success("已新建方案");
      void qc.invalidateQueries({ queryKey: ["nhp", "visit-schemes"] });
      setSchemeId(s.id);
    },
    onError: (e: Error) => toast.error(e.message || "新建方案失败"),
  });

  const renameSchemeMut = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => updateNhpVisitScheme(id, { name }),
    onSuccess: () => {
      toast.success("已重命名");
      void qc.invalidateQueries({ queryKey: ["nhp", "visit-schemes"] });
    },
    onError: (e: Error) => toast.error(e.message || "重命名失败"),
  });

  const deleteSchemeMut = useMutation({
    mutationFn: (id: number) => deleteNhpVisitScheme(id),
    onSuccess: () => {
      toast.success("已删除方案");
      setSchemeId(null);
      void qc.invalidateQueries({ queryKey: ["nhp", "visit-schemes"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "project-visit-scheme", projectId] });
    },
    onError: (e: Error) => toast.error(e.message || "删除方案失败", { duration: 6000 }),
  });

  const handleCreateScheme = async () => {
    const name = (await appPrompt("新建方案名", ""))?.trim();
    if (!name) return;
    createSchemeMut.mutate(name);
  };

  const handleRenameScheme = async () => {
    const s = schemesQuery.data?.find((x) => x.id === schemeId);
    if (!s) return;
    const name = (await appPrompt("方案名", s.name))?.trim();
    if (!name || name === s.name) return;
    renameSchemeMut.mutate({ id: s.id, name });
  };

  const handleDeleteScheme = async () => {
    const s = schemesQuery.data?.find((x) => x.id === schemeId);
    if (!s) return;
    if (await appConfirm(`删除方案「${s.name}」？其下时点也会一并删除。`, { danger: true })) {
      deleteSchemeMut.mutate(s.id);
    }
  };

  const {
    visits,
    forms: allForms,
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
    save,
    isSaving,
    lastSavedAt,
  } = useNhpEventAssignment(projectId, schemeId);

  const folders = flattenFolders(foldersQuery.data ?? []);
  const forms = allForms;

  const matrixKey = `${forms.length}-${visits.length}-${isLoading}`;

  const [configTarget, setConfigTarget] = useState<{ visitId: number; formKey: string } | null>(null);
  const handleCellConfig = (visitId: number, formKey: string) => {
    setConfigTarget({ visitId, formKey });
  };

  useGSAP(
    () => {
      if (!pageRef.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      gsap.fromTo(
        pageRef.current.querySelector(".nhp-assign-panel"),
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", clearProps: "transform,opacity" },
      );
    },
    { scope: pageRef, dependencies: [isLoading] },
  );

  const showMatrix = !isLoading && !isError && forms.length > 0 && visits.length > 0;
  const showEmptyForms = !isLoading && !isError && forms.length === 0;
  const showEmptyVisits = !isLoading && !isError && forms.length > 0 && visits.length === 0;

  return (
    <div className="aup-app aup-app--workbench nhp-assign-page" ref={pageRef} style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              {EVENT_ASSIGNMENT_PAGE.backLabel}
            </button>
            <h1>{EVENT_ASSIGNMENT_PAGE.title}</h1>
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", marginRight: 8 }}>配置目标</label>
              <select
                value={projectId == null ? "" : String(projectId)}
                onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: "5px 8px", fontSize: 13, borderRadius: 6, minWidth: 220 }}
              >
                <option value="" disabled>选择项目…</option>
                {projectsQuery.data?.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.projectName || p.txCode || `项目 #${p.id}`}
                  </option>
                ))}
              </select>
              {projectId != null && (
                <span style={{ marginLeft: 12, display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)" }}>访视方案</label>
                  <select
                    value={schemeId == null ? "" : String(schemeId)}
                    onChange={(e) => {
                      const sid = e.target.value ? Number(e.target.value) : null;
                      setSchemeId(sid);
                      saveSchemeMut.mutate(sid);
                    }}
                    style={{ padding: "5px 8px", fontSize: 13, borderRadius: 6, minWidth: 160 }}
                  >
                    <option value="">默认方案</option>
                    {schemesQuery.data?.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn ghost small" onClick={() => void handleCreateScheme()}>
                    ＋ 新建
                  </button>
                  {schemeId != null && (
                    <>
                      <button type="button" className="btn ghost small" onClick={() => void handleRenameScheme()}>
                        重命名
                      </button>
                      <button type="button" className="btn danger small" onClick={() => void handleDeleteScheme()}>
                        删除
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
          {!isLoading && !isError && forms.length > 0 && <AssignmentStatsBar stats={stats} />}
        </div>

        <div className="nhp-assign-body">
          <div className="aup-wb-panel nhp-assign-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">{EVENT_ASSIGNMENT_PAGE.panelTitle}</span>
              {isDirty && <span className="aup-wb-chip warn">未保存</span>}
            </div>

            {projectId == null ? (
              <div className="nhp-assign-state">请先在「配置目标」选择项目</div>
            ) : isLoading ? (
              <div className="nhp-assign-state">{EVENT_ASSIGNMENT_PAGE.loading}</div>
            ) : isError ? (
              <div className="nhp-assign-state nhp-assign-state--error">{EVENT_ASSIGNMENT_PAGE.error}</div>
            ) : showEmptyForms ? (
              <div className="nhp-assign-state">{EVENT_ASSIGNMENT_PAGE.emptyForms}</div>
            ) : showEmptyVisits ? (
              <div className="nhp-assign-state">{EVENT_ASSIGNMENT_PAGE.emptyVisits}</div>
            ) : showMatrix ? (
              <AssignmentMatrix
                visits={visits}
                forms={forms}
                folders={folders}
                assigned={assigned}
                stats={stats}
                rowState={rowState}
                colState={colState}
                onToggleCell={toggleCell}
                onToggleRow={toggleRow}
                onToggleCol={toggleCol}
                onCellConfig={handleCellConfig}
                onAddVisit={() => void handleAddVisit()}
                onDeleteVisit={(id) => void handleDeleteVisit(id)}
                onRenameVisit={(id) => void handleRenameVisit(id)}
                onInsertAfter={(id) => void handleInsertAfter(id)}
                onMoveVisit={(id, dir) => handleMoveVisit(id, dir)}
                matrixKey={matrixKey}
              />
            ) : null}
          </div>

          {forms.length > 0 && visits.length > 0 && (
            <AssignmentToolbar
              isSaving={isSaving}
              isDirty={isDirty}
              onReset={reset}
              onSave={save}
              lastSavedAt={lastSavedAt}
            />
          )}

        </div>
      </div>

      {configTarget && (
        <FormAccessCellPopup
          projectId={projectId ?? 0}
          eventId={configTarget.visitId}
          formKey={configTarget.formKey}
          onClose={() => setConfigTarget(null)}
        />
      )}
    </div>
  );
}
