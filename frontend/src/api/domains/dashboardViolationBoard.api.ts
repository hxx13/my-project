/**
 * 主页「提醒公示」接口（需登录）。
 * 与后端 PublicDashboardViolationBoardController 对接。
 */

export type DashboardViolationBoardMember = {
  name: string;
};

export type DashboardViolationBoardItem = {
  id: number;
  displayName: string;
  /** 课题组名（笼架联动批量违规时有值，前端以此区分单人/课题组渲染） */
  groupName?: string | null;
  /** 组卡成员名单 */
  members?: DashboardViolationBoardMember[] | null;
  /** 状态标签（组卡彩色标签；个人违规为 null） */
  statusLabel?: string | null;
  summary: string;
  /** 展示图片列表（正文图片 + 旧记录单独上传图片，兼容历史） */
  imageUrls?: string[] | null;
  createdAt?: string | null;
};

export type DashboardViolationBoardResponse = {
  enabled: boolean;
  items: DashboardViolationBoardItem[];
};

type ApiResult<T> = { success?: boolean; message?: string; data?: T };

export async function fetchDashboardViolationBoard(): Promise<DashboardViolationBoardResponse> {
  const token = localStorage.getItem("auth_token") || "";
  const res = await fetch("/api/public/dashboard/violation-board", {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  // 未登录时不报错，静默返回空列表
  if (res.status === 401) {
    return { enabled: false, items: [] };
  }
  if (!res.ok) {
    throw new Error(`大屏提醒公示加载失败 (HTTP ${res.status})`);
  }
  const json = (await res.json()) as ApiResult<DashboardViolationBoardResponse>;
  if (!json?.success || !json.data) {
    throw new Error(json?.message || "大屏提醒公示加载失败");
  }
  const data = json.data;
  return {
    enabled: Boolean(data.enabled),
    items: Array.isArray(data.items) ? data.items : [],
  };
}
