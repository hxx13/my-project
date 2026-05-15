import { authHttp } from "@/api/core/authHttp";

export interface PendingBadges {
  repair: number;
  purchase: number;
  supplies: number;
  notify: number;
  processRepair: number;
  processPurchase: number;
  processSupplies: number;
  /** 站内信（好友）未读条数，与 /api/chat 已读游标同源 */
  chatUnread?: number;
  repairText: string;
  purchaseText: string;
  suppliesText: string;
  notifyText: string;
  processRepairText: string;
  processPurchaseText: string;
  processSuppliesText: string;
  chatUnreadText?: string;
  /**
   * 侧栏「消息」单一汇总（GET /api/me/pending-badges）：chat + notify + repair + purchase + supplies，
   * 与后端 PendingBadgesService 计算一致；侧栏角标优先用此字段，避免与消息页事件双源。
   */
  staffMessagesSidebarTotal?: number;
  staffMessagesSidebarTotalText?: string;
  /** 与消息页「待处理」合并列表条数同源（后端 StaffUnifiedWorkInboxPendingCounter） */
  staffUnifiedWorkInboxPending?: number;
}

interface ResultBody {
  success: boolean;
  data?: PendingBadges;
  message?: string;
}

export async function fetchPendingBadges(): Promise<PendingBadges | null> {
  const res = await authHttp.get<ResultBody>("/me/pending-badges");
  const body = res.data;
  if (!body?.success || !body.data) return null;
  return body.data;
}

/** 与 GET /api/me/capability-summary 一致，用于 Web 与小程序相同的业务能力显隐（勿仅用本地 ROLE）。 */
export type CapabilitySummaryBiz = {
  bizDomain: string;
  canSubmit: boolean;
  canProcess: boolean;
  canViewAllPending: boolean;
  applicantOnlyMineMode: boolean;
};

interface CapabilitySummaryResultBody {
  success: boolean;
  data?: CapabilitySummaryBiz[];
  message?: string;
}

/** Twin Web 壳主题，与 /api/me/mini-preferences 中 twinWebChromeTheme 一致 */
export type TwinWebChromeThemeId = "standard" | "dashboardSciFi";

export interface MiniPreferencesRoomWatchSelection {
  campus: string;
  floor: string;
}

export interface MiniPreferences {
  roomWatch: {
    selections: MiniPreferencesRoomWatchSelection[];
  };
  twinWebChromeTheme?: TwinWebChromeThemeId | string | null;
}

interface MiniPreferencesResultBody {
  success?: boolean;
  code?: number;
  data?: MiniPreferences;
  message?: string;
}

export function defaultMiniPreferences(): MiniPreferences {
  return {
    roomWatch: { selections: [] },
    twinWebChromeTheme: "standard",
  };
}

export async function fetchMiniPreferences(): Promise<MiniPreferences | null> {
  try {
    const res = await authHttp.get<MiniPreferencesResultBody>("/me/mini-preferences");
    const body = res.data;
    const ok = body?.success === true || Number(body?.code) === 200;
    if (!ok || !body?.data) return null;
    const d = body.data;
    if (!d.roomWatch) d.roomWatch = { selections: [] };
    if (!Array.isArray(d.roomWatch.selections)) d.roomWatch.selections = [];
    return d;
  } catch {
    return null;
  }
}

export async function saveMiniPreferences(prefs: MiniPreferences): Promise<MiniPreferences> {
  const res = await authHttp.put<MiniPreferencesResultBody>("/me/mini-preferences", prefs);
  const body = res.data;
  const ok = body?.success === true || Number(body?.code) === 200;
  if (!ok || !body?.data) {
    throw new Error(body?.message || "保存个人配置失败");
  }
  const d = body.data;
  if (!d.roomWatch) d.roomWatch = { selections: [] };
  if (!Array.isArray(d.roomWatch.selections)) d.roomWatch.selections = [];
  return d;
}

export async function fetchCapabilitySummaryMap(): Promise<Record<string, CapabilitySummaryBiz>> {
  try {
    const res = await authHttp.get<CapabilitySummaryResultBody>("/me/capability-summary");
    const body = res.data;
    if (!body?.success || !Array.isArray(body.data)) return {};
    const map: Record<string, CapabilitySummaryBiz> = {};
    for (const r of body.data) {
      const d = String(r.bizDomain || "")
        .trim()
        .toUpperCase();
      if (!d) continue;
      map[d] = {
        bizDomain: d,
        canSubmit: !!r.canSubmit,
        canProcess: !!r.canProcess,
        canViewAllPending: !!r.canViewAllPending,
        applicantOnlyMineMode: !!r.applicantOnlyMineMode,
      };
    }
    return map;
  } catch {
    return {};
  }
}
