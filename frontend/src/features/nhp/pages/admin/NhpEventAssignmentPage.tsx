/**
 * NHP 表单-事件指派矩阵（对齐 REDCap "Designate Instruments for Events"）。
 * 行 = 已发布表单（原子/组合）；列 = 事件（访视时点）；格 = 是否指派。
 */
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { EVENT_ASSIGNMENT_PAGE } from "../../event-assignment/eventAssignment.config";
import { useNhpEventAssignment } from "../../hooks/useNhpEventAssignment";
import { AssignmentMatrix } from "../../components/event-assignment/AssignmentMatrix";
import { AssignmentStatsBar } from "../../components/event-assignment/AssignmentStatsBar";
import { AssignmentToolbar } from "../../components/event-assignment/AssignmentToolbar";
import { listAupFolders, type AupFolderVO } from "@/features/aup/api/aup.api";
import { fetchNhpProjects } from "../../api/nhpRecord.api";
import {
  fetchNhpProjectVisitScheme,
  fetchNhpVisitSchemes,
  saveNhpProjectVisitScheme,
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

export default function NhpEventAssignmentPage() {
  const goBack = useGoBack(EVENT_ASSIGNMENT_PAGE.backPath);
  const pageRef = useRef<HTMLDivElement>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [schemeId, setSchemeId] = useState<number | null>(null);

  const foldersQuery = useQuery({
    queryKey: ["aup", "folders", NHP_FORM_OWNER],
    queryFn: () => listAupFolders(NHP_FORM_OWNER),
  });

  const projectsQuery = useQuery({
    queryKey: ["nhp", "projects"],
    queryFn: () => fetchNhpProjects(),
  });

  const schemesQuery = useQuery({
    queryKey: ["nhp", "visit-schemes"],
    queryFn: fetchNhpVisitSchemes,
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
    onSuccess: () => toast.success("已保存访视方案"),
    onError: (e: Error) => toast.error(e.message || "保存方案失败"),
  });

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
            <div className="sub">{EVENT_ASSIGNMENT_PAGE.subtitle}</div>
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", marginRight: 8 }}>配置目标</label>
              <select
                value={projectId == null ? "" : String(projectId)}
                onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: "5px 8px", fontSize: 13, borderRadius: 6, minWidth: 220 }}
              >
                <option value="">全局模板</option>
                {projectsQuery.data?.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.projectName || p.txCode || `项目 #${p.id}`}
                  </option>
                ))}
              </select>
              {projectId != null && (
                <span style={{ marginLeft: 12 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", marginRight: 8 }}>访视方案</label>
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

            {isLoading ? (
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
    </div>
  );
}
