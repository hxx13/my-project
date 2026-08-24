/**
 * NHP 表单-事件指派矩阵（对齐 REDCap "Designate Instruments for Events"）。
 * 行 = 已发布表单（原子/组合）；列 = 事件（访视时点）；格 = 是否指派。
 */
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { EVENT_ASSIGNMENT_PAGE } from "../../event-assignment/eventAssignment.config";
import { useNhpEventAssignment } from "../../hooks/useNhpEventAssignment";
import { AssignmentMatrix } from "../../components/event-assignment/AssignmentMatrix";
import { AssignmentStatsBar } from "../../components/event-assignment/AssignmentStatsBar";
import { AssignmentToolbar } from "../../components/event-assignment/AssignmentToolbar";
import "@/features/aup/aup.css";
import "../../nhp.css";

gsap.registerPlugin(useGSAP);

export default function NhpEventAssignmentPage() {
  const goBack = useGoBack(EVENT_ASSIGNMENT_PAGE.backPath);
  const pageRef = useRef<HTMLDivElement>(null);

  const {
    visits,
    forms,
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
  } = useNhpEventAssignment();

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
