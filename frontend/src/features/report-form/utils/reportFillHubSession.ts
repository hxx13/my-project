/** 填报中心列表 UI 会话缓存（返回时恢复展开项、滚动位置、最近打开的报表） */

const STORAGE_KEY = 'report-fill-hub-session';

export type ReportFillHubSession = {
  expandedFormIds: number[];
  scrollY: number;
  lastFormId?: number;
  lastSubmissionId?: number;
};

export function readReportFillHubSession(): ReportFillHubSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReportFillHubSession;
    if (!parsed || !Array.isArray(parsed.expandedFormIds)) return null;
    return {
      expandedFormIds: parsed.expandedFormIds.filter((id) => typeof id === 'number'),
      scrollY: typeof parsed.scrollY === 'number' ? parsed.scrollY : 0,
      lastFormId: typeof parsed.lastFormId === 'number' ? parsed.lastFormId : undefined,
      lastSubmissionId: typeof parsed.lastSubmissionId === 'number' ? parsed.lastSubmissionId : undefined,
    };
  } catch {
    return null;
  }
}

export function writeReportFillHubSession(patch: Partial<ReportFillHubSession>): void {
  try {
    const prev = readReportFillHubSession() ?? { expandedFormIds: [], scrollY: 0 };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function snapshotReportFillHubSession(
  expanded: Set<number>,
  extra?: Pick<ReportFillHubSession, 'lastFormId' | 'lastSubmissionId'>,
): void {
  writeReportFillHubSession({
    expandedFormIds: [...expanded],
    scrollY: window.scrollY || document.documentElement.scrollTop || 0,
    ...extra,
  });
}
