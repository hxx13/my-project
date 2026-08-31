import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { AssignmentTriState } from "../../event-assignment/eventAssignment.types";
import { TriStateCheckbox } from "./TriStateCheckbox";

gsap.registerPlugin(useGSAP);

export interface MatrixRow {
  id: string | number;
  label: string;
  subLabel?: string;
  /** 行头右侧附加内容（如 code chip） */
  adornment?: ReactNode;
}
export interface MatrixColumn {
  id: string | number;
  label: string;
  subLabel?: string;
}

interface MatrixTableProps {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  cellOn: (rowId: string | number, colId: string | number) => boolean;
  onToggleCell: (rowId: string | number, colId: string | number) => void;
  cellDisabled?: (rowId: string | number, colId: string | number) => boolean;
  /** 行头批量勾选（可选，缺省不显示行头 checkbox） */
  rowTriState?: (rowId: string | number) => AssignmentTriState;
  onToggleRow?: (rowId: string | number) => void;
  /** 列头批量勾选（可选） */
  colTriState?: (colId: string | number) => AssignmentTriState;
  onToggleCol?: (colId: string | number) => void;
  cornerLabel?: string;
  cornerCount?: string;
  matrixKey?: string;
}

/** 通用矩阵表格：行=主体、列=维度、格子=勾选。复用事件指派矩阵的 nhp-assign-* 样式。 */
export function MatrixTable({
  rows,
  columns,
  cellOn,
  onToggleCell,
  cellDisabled,
  rowTriState,
  onToggleRow,
  colTriState,
  onToggleCol,
  cornerLabel = "主体 \\ 维度",
  cornerCount,
  matrixKey = "matrix",
}: MatrixTableProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  useGSAP(
    () => {
      if (!tableRef.current) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced) return;
      const headerCells = tableRef.current.querySelectorAll(".nhp-assign-col-hd");
      const rowsEl = tableRef.current.querySelectorAll(".nhp-assign-row");
      gsap.fromTo(headerCells, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.03, ease: "power2.out", clearProps: "transform,opacity" });
      gsap.fromTo(rowsEl, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.04, ease: "power2.out", delay: 0.08, clearProps: "transform,opacity" });
    },
    { scope: wrapRef, dependencies: [matrixKey], revertOnUpdate: true },
  );

  return (
    <div className="nhp-assign-matrix-wrap" ref={wrapRef}>
      <table className="nhp-assign-matrix" ref={tableRef}>
        <thead>
          <tr>
            <th className="nhp-assign-corner">
              <span className="nhp-assign-corner-label">{cornerLabel}</span>
              {cornerCount != null && <span className="nhp-assign-corner-count">{cornerCount}</span>}
            </th>
            {columns.map((c) => (
              <th key={c.id} className="nhp-assign-col-hd">
                <div className="nhp-assign-col-code">{c.label}</div>
                {c.subLabel != null && <div className="nhp-assign-col-name" title={c.subLabel}>{c.subLabel}</div>}
                {colTriState && onToggleCol && (
                  <TriStateCheckbox state={colTriState(c.id)} onChange={() => onToggleCol(c.id)} />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="nhp-assign-row">
              <td className="nhp-assign-row-hd">
                <div className="nhp-assign-row-inner">
                  {rowTriState && onToggleRow && (
                    <TriStateCheckbox state={rowTriState(r.id)} onChange={() => onToggleRow(r.id)} />
                  )}
                  <div className="nhp-assign-row-text">
                    <div className="nhp-assign-row-title">{r.label}</div>
                    {r.subLabel != null && (
                      <div className="nhp-assign-row-sub">
                        <span className="nhp-assign-row-key">{r.subLabel}</span>
                      </div>
                    )}
                  </div>
                  {r.adornment}
                </div>
              </td>
              {columns.map((c) => {
                const on = cellOn(r.id, c.id);
                const disabled = cellDisabled?.(r.id, c.id) ?? false;
                return (
                  <td
                    key={c.id}
                    className={`nhp-assign-cell${on ? " nhp-assign-cell--on" : ""}${disabled ? " nhp-assign-cell--disabled" : ""}`}
                    onClick={() => { if (!disabled) onToggleCell(r.id, c.id); }}
                    role="checkbox"
                    aria-checked={on}
                    tabIndex={disabled ? -1 : 0}
                  >
                    <span className="nhp-assign-cell-dot" aria-hidden />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
