import type { NhpTemplateListItem } from "../api/nhpTemplate.api";
import type { NhpVisit } from "../api/nhpVisit.api";

/** Tri-state for row/column bulk checkboxes */
export type AssignmentTriState = "none" | "some" | "all";

export type AssignmentCellKey = `${number}:${number}`;

export interface AssignmentMatrixStats {
  totalCells: number;
  assignedCells: number;
  formCount: number;
  visitCount: number;
}

export interface AssignmentMatrixRow {
  formId: number;
  form: NhpTemplateListItem;
  triState: AssignmentTriState;
}

export interface AssignmentMatrixColumn {
  visitId: number;
  visit: NhpVisit;
  triState: AssignmentTriState;
}

export interface AssignmentToolbarAction {
  id: "reset" | "save";
  label: string;
  pendingLabel?: string;
  variant: "ghost" | "primary";
  disabled?: boolean;
}
