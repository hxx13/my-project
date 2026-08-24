import type { NhpTemplateListItem } from "../api/nhpTemplate.api";
import type { NhpVisitPlan } from "../api/nhpVisit.api";
import { assignableFormId } from "../api/nhpTemplate.api";
import type { NhpVisit } from "../api/nhpVisit.api";
import type {
  AssignmentCellKey,
  AssignmentMatrixStats,
  AssignmentTriState,
} from "./eventAssignment.types";

export function assignmentCellKey(visitId: number, formId: number): AssignmentCellKey {
  return `${visitId}:${formId}`;
}

export function plansToAssignedSet(plans: NhpVisitPlan[]): Set<AssignmentCellKey> {
  const next = new Set<AssignmentCellKey>();
  for (const p of plans) next.add(assignmentCellKey(p.visitId, p.atomId));
  return next;
}

export function computeTriState(keys: AssignmentCellKey[], assigned: Set<AssignmentCellKey>): AssignmentTriState {
  const on = keys.filter((k) => assigned.has(k)).length;
  if (on === 0) return "none";
  if (on === keys.length) return "all";
  return "some";
}

export function rowKeys(formId: number, visits: NhpVisit[]): AssignmentCellKey[] {
  return visits.map((v) => assignmentCellKey(v.id, formId));
}

export function colKeys(visitId: number, forms: NhpTemplateListItem[]): AssignmentCellKey[] {
  return forms.map((f) => assignmentCellKey(visitId, assignableFormId(f)));
}

export function computeMatrixStats(
  visits: NhpVisit[],
  forms: NhpTemplateListItem[],
  assigned: Set<AssignmentCellKey>,
): AssignmentMatrixStats {
  return {
    totalCells: visits.length * forms.length,
    assignedCells: assigned.size,
    formCount: forms.length,
    visitCount: visits.length,
  };
}

/** Detect local edits vs server plans */
export function isAssignmentDirty(
  assigned: Set<AssignmentCellKey>,
  plans: NhpVisitPlan[],
): boolean {
  const server = plansToAssignedSet(plans);
  if (server.size !== assigned.size) return true;
  for (const k of assigned) {
    if (!server.has(k)) return true;
  }
  return false;
}
