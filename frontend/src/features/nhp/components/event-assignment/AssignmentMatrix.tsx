import { Fragment, useMemo, useRef, useCallback, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { NhpTemplateListItem } from "../../api/nhpTemplate.api";
import type { NhpVisit } from "../../api/nhpVisit.api";
import { formRowMeta, visitColumnMeta, EVENT_ASSIGNMENT_PAGE } from "../../event-assignment/eventAssignment.config";
import { assignmentCellKey } from "../../event-assignment/eventAssignment.utils";
import type { AssignmentMatrixStats } from "../../event-assignment/eventAssignment.types";
import type { AssignmentTriState } from "../../event-assignment/eventAssignment.types";
import { TriStateCheckbox } from "./TriStateCheckbox";

gsap.registerPlugin(useGSAP);

interface AssignmentMatrixProps {
  visits: NhpVisit[];
  forms: NhpTemplateListItem[];
  /** 文件夹（扁平，带缩进名），用于行分组；缺省则不分组 */
  folders?: { id: number; name: string }[];
  assigned: Set<string>;
  stats: AssignmentMatrixStats;
  rowState: (formId: number) => AssignmentTriState;
  colState: (visitId: number) => AssignmentTriState;
  onToggleCell: (visitId: number, formId: number) => void;
  onToggleRow: (formId: number) => void;
  onToggleCol: (visitId: number) => void;
  matrixKey: string;
}

type Section = { key: string; label: string; forms: NhpTemplateListItem[] };

export function AssignmentMatrix({
  visits,
  forms,
  folders,
  assigned,
  stats,
  rowState,
  colState,
  onToggleCell,
  onToggleRow,
  onToggleCol,
  matrixKey,
}: AssignmentMatrixProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const sections = useMemo<Section[]>(() => {
    if (!folders || folders.length === 0) {
      return forms.length ? [{ key: "__all__", label: "全部表单", forms }] : [];
    }
    const byFolder = new Map<number, NhpTemplateListItem[]>();
    const ungrouped: NhpTemplateListItem[] = [];
    for (const f of forms) {
      if (f.folderId != null) {
        const list = byFolder.get(f.folderId) ?? [];
        list.push(f);
        byFolder.set(f.folderId, list);
      } else {
        ungrouped.push(f);
      }
    }
    const out: Section[] = [];
    for (const folder of folders) {
      const list = byFolder.get(folder.id);
      if (list && list.length > 0) {
        out.push({ key: `f${folder.id}`, label: folder.name, forms: list });
      }
    }
    if (ungrouped.length > 0) {
      out.push({ key: "__ungrouped__", label: "未分类", forms: ungrouped });
    }
    return out;
  }, [folders, forms]);

  useGSAP(
    () => {
      if (!tableRef.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;

      const headerCells = tableRef.current.querySelectorAll(".nhp-assign-col-hd");
      const rows = tableRef.current.querySelectorAll(".nhp-assign-row");

      gsap.fromTo(
        headerCells,
        { opacity: 0, y: -8 },
        { opacity: 1, y: 0, duration: 0.3, stagger: 0.03, ease: "power2.out", clearProps: "transform,opacity" },
      );
      gsap.fromTo(
        rows,
        { opacity: 0, x: -12 },
        { opacity: 1, x: 0, duration: 0.35, stagger: 0.04, ease: "power2.out", delay: 0.08, clearProps: "transform,opacity" },
      );
    },
    { scope: wrapRef, dependencies: [matrixKey], revertOnUpdate: true },
  );

  const pulseCell = useCallback((el: HTMLElement | null, turningOn: boolean) => {
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    gsap.fromTo(
      el,
      { scale: turningOn ? 0.92 : 1, opacity: turningOn ? 0.7 : 1 },
      { scale: 1, opacity: 1, duration: 0.22, ease: "back.out(1.6)", clearProps: "transform,opacity" },
    );
  }, []);

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderFormRow = (f: NhpTemplateListItem) => {
    const meta = formRowMeta(f);
    return (
      <tr key={meta.formId} className="nhp-assign-row">
        <td className="nhp-assign-row-hd">
          <div className="nhp-assign-row-inner">
            <TriStateCheckbox
              state={rowState(meta.formId)}
              onChange={() => onToggleRow(meta.formId)}
              title="批量勾选该表单到所有事件"
            />
            <div className="nhp-assign-row-text">
              <div className="nhp-assign-row-title" title={meta.title}>
                {meta.title}
              </div>
              <div className="nhp-assign-row-sub">
                <span className={`nhp-assign-kind nhp-assign-kind--${meta.kind}`}>
                  {meta.kind === "composite" ? "组合" : "原子"}
                </span>
                <span className="nhp-assign-row-key">{meta.subtitle.split(" · ")[1] ?? meta.subtitle}</span>
                {meta.hostType === "DONOR" || meta.hostType === "RECIPIENT" ? (
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 999,
                      background: meta.hostType === "DONOR" ? "#fff7ed" : "#ecfeff",
                      color: meta.hostType === "DONOR" ? "#c2410c" : "#0e7490",
                    }}
                  >
                    {meta.hostType === "DONOR" ? "供体载体" : "受体载体"}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </td>
        {visits.map((v) => {
          const k = assignmentCellKey(v.id, meta.formId);
          const on = assigned.has(k);
          return (
            <td
              key={v.id}
              className={`nhp-assign-cell${on ? " nhp-assign-cell--on" : ""}`}
              onClick={(e) => {
                pulseCell(e.currentTarget, !on);
                onToggleCell(v.id, meta.formId);
              }}
              role="checkbox"
              aria-checked={on}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  pulseCell(e.currentTarget, !on);
                  onToggleCell(v.id, meta.formId);
                }
              }}
            >
              <span className="nhp-assign-cell-dot" aria-hidden />
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="nhp-assign-matrix-wrap" ref={wrapRef}>
      <table className="nhp-assign-matrix" ref={tableRef}>
        <thead>
          <tr>
            <th className="nhp-assign-corner">
              <span className="nhp-assign-corner-label">{EVENT_ASSIGNMENT_PAGE.cornerLabel}</span>
              <span className="nhp-assign-corner-count">
                {stats.assignedCells}/{stats.totalCells}
              </span>
            </th>
            {visits.map((v) => {
              const meta = visitColumnMeta(v);
              return (
                <th key={v.id} className="nhp-assign-col-hd">
                  <div className="nhp-assign-col-code">{meta.code}</div>
                  <div className="nhp-assign-col-name" title={meta.name}>
                    {meta.name}
                  </div>
                  <TriStateCheckbox
                    state={colState(v.id)}
                    onChange={() => onToggleCol(v.id)}
                    title={meta.title}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => {
            const isCollapsed = collapsed.has(section.key);
            return (
              <Fragment key={section.key}>
                <tr
                  className="nhp-assign-folder-row"
                  onClick={() => toggle(section.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggle(section.key);
                    }
                  }}
                >
                  <td colSpan={visits.length + 1}>
                    <div className="nhp-assign-folder-hd">
                      <span className="chev">{isCollapsed ? "▸" : "▾"}</span>
                      <span className="name">{section.label}</span>
                      <span className="count">{section.forms.length} 表单</span>
                    </div>
                  </td>
                </tr>
                {!isCollapsed && section.forms.map(renderFormRow)}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
