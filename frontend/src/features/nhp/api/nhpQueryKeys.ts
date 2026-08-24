import type { QueryClient } from "@tanstack/react-query";

export const nhpSubjectBoardKey = ["nhp", "subject-board"] as const;

export type NhpSubjectListParams = {
  subjectType?: string;
  status?: string;
  q?: string;
  page?: number;
  size?: number;
};

export const nhpSubjectListKey = (params?: NhpSubjectListParams) =>
  ["nhp", "subjects", params ?? {}] as const;

/** Invalidate subject list + board; optional per-subject detail/records when mutating one animal. */
export function invalidateNhpSubjectCaches(
  qc: QueryClient,
  opts?: { subjectId?: number; records?: boolean },
) {
  void qc.invalidateQueries({ queryKey: ["nhp", "subjects"] });
  void qc.invalidateQueries({ queryKey: nhpSubjectBoardKey });
  const sid = opts?.subjectId;
  if (sid != null && sid > 0) {
    void qc.invalidateQueries({ queryKey: ["nhp", "subject", sid] });
    void qc.invalidateQueries({ queryKey: ["nhp", "records", sid] });
    void qc.invalidateQueries({ queryKey: ["nhp", "fill-records", sid] });
    void qc.invalidateQueries({ queryKey: ["nhp", "todos", sid] });
  }
  if (opts?.records) {
    void qc.invalidateQueries({ queryKey: ["nhp", "records-all"] });
  }
}
