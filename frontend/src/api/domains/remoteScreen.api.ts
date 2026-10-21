import { adminHttp } from "@/api/core/adminHttp";
import { authHttp } from "@/api/core/authHttp";
import { fetchMiniPreferences } from "@/api/domains/me.api";

/**
 * 远程屏幕（网页控制）。
 *
 * 每个浏览器一个编号（localStorage），名字由使用者起。
 * **只能操作本账号登录的页面** —— 后端按账号过滤，不是前端挡的。
 */

export interface RemoteScreenView {
  screenId: string;
  /** 配对码：页面上显示、另一端输入它来配对 */
  code: string;
  label: string;
  route: string;
  title: string;
  ip: string;
  lastSeenAt: string;
}

export async function listRemoteScreens(): Promise<RemoteScreenView[]> {
  const res = await adminHttp.get<{ data: RemoteScreenView[] }>("/screens");
  return res.data?.data ?? [];
}

/** 用配对码找页面：可以连**别的账号/别的设备**打开的页面 */
export async function pairRemoteScreen(code: string): Promise<RemoteScreenView> {
  const res = await adminHttp.post<{ data: RemoteScreenView }>("/screens/pair", { code });
  return res.data?.data as RemoteScreenView;
}

/**
 * 让页面跳转。
 * `code` 传了才允许操作**不属于本账号**的页面（配对来的那台）。
 */
export async function navigateRemoteScreen(screenId: string, route: string, code?: string | null): Promise<void> {
  await adminHttp.post(`/screens/${encodeURIComponent(screenId)}/navigate`, { route, code: code || null });
}

export async function renameRemoteScreen(screenId: string, label: string): Promise<void> {
  await adminHttp.put(`/screens/${encodeURIComponent(screenId)}/label`, { label });
}

// ── 远程切换页面的收藏（按路由记，**和侧栏收藏分开**）──
//
// 存在账号的 mini-preferences 里（字段 remoteRouteStars）。只提交这一个字段，
// 后端会合并缺省字段，不会冲掉主题等其它配置。

export async function fetchRemoteRouteStars(): Promise<string[]> {
  const p = await fetchMiniPreferences();
  return Array.isArray(p?.remoteRouteStars) ? p.remoteRouteStars : [];
}

/**
 * 切换某一条收藏（加/移），返回切换后的完整列表。
 * **按单个路由提交**，不传整份列表 —— 多端同时改时不会互相覆盖。
 */
export async function toggleRemoteRouteStar(path: string): Promise<string[]> {
  const res = await authHttp.post<{ data: string[] }>(
    "/me/mini-preferences/remote-route-stars/toggle",
    { path }
  );
  return res.data?.data ?? [];
}

/** 常用后台页面（与小程序同一套） */
export const REMOTE_ROUTE_OPTIONS: { label: string; value: string }[] = [
  { label: "驾驶舱", value: "/console/dashboard" },
  { label: "电视墙", value: "/console/admin/video-wall" },
  { label: "网络广播", value: "/console/admin/broadcast" },
  { label: "笼架", value: "/console/admin/cage-shelves" },
  { label: "动物订购", value: "/console/admin/animal-order" },
  { label: "AUP", value: "/console/admin/aup" },
  { label: "人员", value: "/console/admin/personnel" },
  { label: "ARO 绑定", value: "/console/admin/aro-binding" },
  { label: "门禁控制", value: "/console/admin/door-control" },
  { label: "通行规则", value: "/console/admin/access-rules" },
  { label: "AGV 轨迹", value: "/console/admin/agv-tracker" },
  { label: "统计分析", value: "/console/admin/analytics" },
  { label: "物资库存", value: "/console/admin/inventory" },
  { label: "合同打印", value: "/console/admin/card-print" },
];
