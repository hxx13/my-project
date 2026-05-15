import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  fetchPagePermissionTree,
  notifyWebPublicPagePermissionsUpdated,
  resetPagePermissionDefaults,
  scanPagePermissions,
  updatePagePermission,
  type MinRole,
  type PagePermissionNode,
  type PagePlatform,
} from "@/api/domains/pagePermission.api";
import { AdminPageShell, AdminTableShell } from "@/components/admin/AdminPageShell";
import { normalizeAdminPath } from "@/features/admin/buildAdminNavModel";

const ROLE_OPTIONS: MinRole[] = ["STUDENT", "STAFF", "SENIOR", "ADMIN", "SUPER_ADMIN", "PLATFORM_OWNER"];

const ROLE_LABEL: Record<MinRole, string> = {
  STUDENT: "学生",
  STAFF: "教职工",
  SENIOR: "高级职工",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
  PLATFORM_OWNER: "平台所有者",
};

const PATH_TITLE_MAP: Record<string, string> = {
  "/admin": "后台首页",
  "/admin/notifications": "消息通知",
  "/admin/repair-request": "报修申请",
  "/admin/repair-process": "报修处理",
  "/admin/purchase-request": "采购申请",
  "/admin/purchase-process": "采购处理",
  "/admin/supplies": "领用物资",
  "/admin/supplies/mine": "我的领用记录",
  "/admin/supplies/claim-export": "领用单导出预览",
  "/admin/supplies/manage": "物资管理",
  "/admin/supplies/process": "物资处理",
  "/admin/supplies/audit-export": "领用导出",
  "/admin/facility-maintenance": "检查维护",
  "/admin/asset-records": "资产记录",
  "/admin/asset-transfer-records": "转移记录",
  "/admin/cage-shelves": "笼架信息",
  "/admin/personnel": "人员授权",
  "/admin/settings": "系统设置",
  "/admin/external-comm-config": "外部通信配置",
  "/admin/api-docs": "接口中心",
  "/admin/page-permissions": "页面权限设置",
  "/admin/staff-messages": "好友",
  "/admin/file-templates": "文件模板库",
  "/admin/content-hub": "小程序内容中心",
  "/admin/dahua-swing-tasks": "门禁拉取规则",
  "/admin/dahua-swing-rules": "门禁联动规则",
  "/admin/dahua-swing-records": "门禁记录库",
  "/pages/index/index": "首页",
  "/pages/mine/index": "我的",
  "/pages/notifications/index": "消息通知",
  "/pages/repairRequest/index": "报修申请",
  "/pages/repairProcess/index": "报修处理",
  "/pages/purchaseRequest/index": "采购申请",
  "/pages/purchaseProcess/index": "采购处理",
  "/pages/supplies/index": "领用物资",
  "/pages/suppliesProcess/index": "物资处理",
  "/pages/suppliesClaimExport/index": "领用单导出",
  "/pages/suppliesAdmin/index": "物资管理",
  "/pages/facilityMaintenance/index": "检查维护",
  "/pages/facilityMaintenance/historyInsp": "历史巡查记录",
  "/pages/facilityMaintenance/settings": "检查维护设置",
  "/pages/assetRecord/index": "资产记录",
  "/pages/assetTransferRecord/index": "转移记录",
  "/pages/adminPersonnel/index": "人员授权",
  "/pages/announcementAdmin/index": "公告管理",
  "/pages/releaseNotesAdmin/index": "版本公告管理",
  "/pages/homeBulletinDetail/index": "首页公告详情",
  "/pages/settingsRoomWatch/index": "房间红点与关注",
};

const PATH_BRIEF_MAP: Record<string, string> = {
  "/admin/notifications": "查看和处理系统通知消息。",
  "/admin/repair-request": "提交报修申请并跟踪状态。",
  "/admin/repair-process": "处理报修工单与结果登记。",
  "/admin/purchase-request": "提交采购申请单。",
  "/admin/purchase-process": "审批并处理采购流程。",
  "/admin/supplies": "选择并提交物资领用。",
  "/admin/supplies/mine": "查看与修改本人领用单、导出、回收站恢复。",
  "/admin/supplies/claim-export": "单张领用单明细预览与 Excel 导出。",
  "/admin/supplies/manage": "维护物资与分类基础信息。",
  "/admin/supplies/process": "处理物资领用出库。",
  "/admin/supplies/audit-export": "预览领用单明细、按物品查看库存流水并导出 Excel（采购/报修导出不在此页）。",
  "/admin/asset-records": "查询资产台账记录。",
  "/admin/asset-transfer-records": "查询资产转移记录。",
  "/admin/cage-shelves": "查看笼架笼位与笼盒详情。",
  "/admin/personnel": "管理人员与角色授权。",
  "/admin/settings": "维护系统参数配置。",
  "/admin/external-comm-config": "配置外部通信参数。",
  "/admin/api-docs": "查看后端接口文档。",
  "/admin/page-permissions": "配置页面/入口访问权限。",
};

function nodeTypeZh(type?: string) {
  if (type === "PAGE") return "页面";
  if (type === "ENTRY") return "入口";
  return type || "-";
}

function sourceZh(source?: string) {
  if (!source) return "-";
  if (source === "sidebar") return "左侧栏入口";
  if (source === "tabbar") return "底部Tab入口";
  if (source === "mine") return "我的页入口";
  if (source === "home") return "首页快捷入口";
  if (source === "route") return "路由注册";
  if (source === "page") return "页面注册";
  return source;
}

function titleZh(row: PagePermissionNode) {
  if (row.displayName && row.displayName.trim()) return row.displayName.trim();
  return PATH_TITLE_MAP[row.pathOrRoute] || row.pathOrRoute;
}

function annotation(row: PagePermissionNode) {
  return `${nodeTypeZh(row.nodeType)} · ${sourceZh(row.entrySource)} · 最小角色 ${ROLE_LABEL[(row.minRole || "STUDENT") as MinRole]}`;
}

function canPreviewPath(path: string, platform: PagePlatform) {
  return platform === "WEB" && path.startsWith("/admin");
}

function flatten(nodes: PagePermissionNode[], depth = 0): Array<PagePermissionNode & { depth: number }> {
  const out: Array<PagePermissionNode & { depth: number }> = [];
  for (const node of nodes) {
    out.push({ ...node, depth });
    if (node.children?.length) {
      out.push(...flatten(node.children, depth + 1));
    }
  }
  return out;
}

function rowDomIdForNodeKey(nodeKey: string) {
  return `perm-focus-${nodeKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function normalizeMiniPermissionPath(p: string): string {
  const d = decodeURIComponent(p).trim();
  const withSlash = d.startsWith("/") ? d : `/${d}`;
  return withSlash.replace(/\/+/g, "/");
}

function normPathForPlatform(platform: PagePlatform, routePath: string) {
  return platform === "WEB" ? normalizeAdminPath(routePath) : normalizeMiniPermissionPath(routePath);
}

export default function AdminPagePermissionSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const lastAppliedFocusPath = useRef<string | null>(null);
  const [platform, setPlatform] = useState<PagePlatform>("WEB");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PagePermissionNode[]>([]);
  const [draftByNode, setDraftByNode] = useState<Record<string, { minRole: MinRole; enabled: number }>>({});
  const [savingNodeKey, setSavingNodeKey] = useState<string>("");
  const flatRows = useMemo(() => flatten(rows), [rows]);

  const focusPathParam = searchParams.get("focusPath");

  useEffect(() => {
    if (!focusPathParam || loading || flatRows.length === 0) return;
    const decoded = decodeURIComponent(focusPathParam);
    if (lastAppliedFocusPath.current === decoded) return;
    const norm = normPathForPlatform(platform, decoded);
    const target =
      flatRows.find(
        (r) =>
          r.platform === platform &&
          r.nodeType === "ENTRY" &&
          (platform !== "WEB" || (r.entrySource || "") === "sidebar") &&
          normPathForPlatform(platform, r.pathOrRoute) === norm
      ) || flatRows.find((r) => r.platform === platform && normPathForPlatform(platform, r.pathOrRoute) === norm);
    if (!target) {
      toast.error("未找到对应权限节点，可先点「重新扫描」");
      lastAppliedFocusPath.current = decoded;
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete("focusPath");
          return p;
        },
        { replace: true }
      );
      return;
    }
    lastAppliedFocusPath.current = decoded;
    const id = rowDomIdForNodeKey(target.nodeKey);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-2", "ring-amber-400", "ring-offset-2");
      window.setTimeout(() => el?.classList.remove("ring-2", "ring-amber-400", "ring-offset-2"), 2600);
    });
    toast.success(platform === "WEB" ? "已定位到侧栏入口对应节点" : "已定位到对应权限节点");
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("focusPath");
        return p;
      },
      { replace: true }
    );
  }, [focusPathParam, flatRows, loading, platform, setSearchParams]);

  const patchNode = (list: PagePermissionNode[], nodeKey: string, patch: { minRole: MinRole; enabled: number }): PagePermissionNode[] =>
    list.map((node) => {
      if (node.nodeKey === nodeKey) {
        return { ...node, minRole: patch.minRole, enabled: patch.enabled };
      }
      if (node.children?.length) {
        return { ...node, children: patchNode(node.children, nodeKey, patch) };
      }
      return node;
    });

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPagePermissionTree(platform);
      setRows(data || []);
      const drafts: Record<string, { minRole: MinRole; enabled: number }> = {};
      flatten(data || []).forEach((it) => {
        drafts[it.nodeKey] = {
          minRole: (it.minRole || "STUDENT") as MinRole,
          enabled: it.enabled === 1 ? 1 : 0,
        };
      });
      setDraftByNode(drafts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  useEffect(() => {
    lastAppliedFocusPath.current = null;
  }, [platform]);

  return (
    <AdminPageShell
      title="页面权限设置"
      description={
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p>
            说明：每行展示「中文标题 + 节点注解」。<strong>入口展示名</strong>列对应库内{" "}
            <code className="rounded bg-white px-1">display_name</code>（扫描时从注册表/页面标题推断）。
          </p>
          <p>同一路径可能有多个入口节点（例如侧栏、首页快捷、我的页），请分别按业务需要控制。</p>
          <p>超级管理员可在侧栏入口上<strong>右键</strong>打开快捷面板改权；保存失败会提示具体原因（常见为：子入口角色低于父页面角色）。</p>
          <p className="text-slate-500">
            自动发现规则见仓库 <code className="rounded bg-white px-1">docs/page-permission-discovery.md</code>。
          </p>
        </div>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 text-sm"
            onClick={async () => {
              await scanPagePermissions();
              toast.success("已重新扫描");
              await load();
              notifyWebPublicPagePermissionsUpdated();
            }}
          >
            重新扫描
          </button>
          <button
            type="button"
            className="rounded border border-amber-300 px-3 py-1 text-sm text-amber-700"
            onClick={async () => {
              if (!window.confirm("确认重置当前平台为默认权限？")) return;
              await resetPagePermissionDefaults(platform);
              toast.success("已重置默认");
              await load();
              if (platform === "WEB") notifyWebPublicPagePermissionsUpdated();
            }}
          >
            重置默认
          </button>
        </div>
      }
    >
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          className={`rounded px-3 py-1 text-sm ${platform === "WEB" ? "bg-blue-600 text-white" : "border border-slate-300"}`}
          onClick={() => setPlatform("WEB")}
        >
          网页前端
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1 text-sm ${platform === "MINI" ? "bg-blue-600 text-white" : "border border-slate-300"}`}
          onClick={() => setPlatform("MINI")}
        >
          小程序端
        </button>
      </div>

      <AdminTableShell
        loading={loading}
        empty={!loading && flatRows.length === 0}
        emptyMessage='暂无数据，请点击「重新扫描」'
        onRetry={() => void load()}
        scrollable
      >
        <table>
          <thead>
            <tr>
              <th className="border-b px-2 py-2 text-left">节点</th>
              <th className="border-b px-2 py-2 text-left">入口展示名</th>
              <th className="border-b px-2 py-2 text-left">类型</th>
              <th className="border-b px-2 py-2 text-left">路径</th>
              <th className="border-b px-2 py-2 text-left">来源</th>
              <th className="border-b px-2 py-2 text-left">最小角色</th>
              <th className="border-b px-2 py-2 text-left">开关</th>
              <th className="border-b px-2 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map((row) => (
              <tr key={row.nodeKey} id={rowDomIdForNodeKey(row.nodeKey)} className="scroll-mt-24 transition-shadow">
                <td className="border-b px-2 py-2 text-xs">
                  <div style={{ paddingLeft: `${row.depth * 16}px` }}>
                    <div className="font-medium">{titleZh(row)}</div>
                    <div className="text-slate-500">{annotation(row)}</div>
                    {PATH_BRIEF_MAP[row.pathOrRoute] && (
                      <div className="text-[11px] text-slate-600">{PATH_BRIEF_MAP[row.pathOrRoute]}</div>
                    )}
                    <div className="text-slate-400">{row.nodeKey}</div>
                  </div>
                </td>
                <td className="border-b px-2 py-2 text-xs text-slate-700">
                  {row.nodeType === "ENTRY" ? (
                    <span className="font-medium text-slate-900">{(row.displayName || "").trim() || "—"}</span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="border-b px-2 py-2 text-xs">{nodeTypeZh(row.nodeType)}</td>
                <td className="border-b px-2 py-2 text-xs">{row.pathOrRoute}</td>
                <td className="border-b px-2 py-2 text-xs">{sourceZh(row.entrySource)}</td>
                <td className="border-b px-2 py-2">
                  <select
                    className="rounded border px-2 py-1 text-xs"
                    value={(draftByNode[row.nodeKey]?.minRole || row.minRole) as MinRole}
                    onChange={(e) =>
                      setDraftByNode((prev) => ({
                        ...prev,
                        [row.nodeKey]: {
                          minRole: e.target.value as MinRole,
                          enabled: prev[row.nodeKey]?.enabled ?? (row.enabled === 1 ? 1 : 0),
                        },
                      }))
                    }
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}（{role}）
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border-b px-2 py-2 text-xs">
                  <input
                    type="checkbox"
                    checked={(draftByNode[row.nodeKey]?.enabled ?? row.enabled) === 1}
                    onChange={(e) =>
                      setDraftByNode((prev) => ({
                        ...prev,
                        [row.nodeKey]: {
                          minRole: prev[row.nodeKey]?.minRole ?? (row.minRole as MinRole),
                          enabled: e.target.checked ? 1 : 0,
                        },
                      }))
                    }
                  />
                </td>
                <td className="border-b px-2 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded border border-blue-300 px-2 py-0.5 text-xs text-blue-700"
                      disabled={savingNodeKey === row.nodeKey}
                      onClick={async () => {
                        const draft = draftByNode[row.nodeKey] || { minRole: row.minRole as MinRole, enabled: row.enabled === 1 ? 1 : 0 };
                        try {
                          setSavingNodeKey(row.nodeKey);
                          await updatePagePermission(row.nodeKey, { minRole: draft.minRole, enabled: draft.enabled });
                          setRows((prev) => patchNode(prev, row.nodeKey, draft));
                          toast.success("已保存");
                          if (platform === "WEB") notifyWebPublicPagePermissionsUpdated();
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "保存失败");
                        } finally {
                          setSavingNodeKey("");
                        }
                      }}
                    >
                      {savingNodeKey === row.nodeKey ? "保存中..." : "保存"}
                    </button>
                    {canPreviewPath(row.pathOrRoute, platform) && (
                      <button
                        type="button"
                        className="rounded border border-emerald-300 px-2 py-0.5 text-xs text-emerald-700"
                        onClick={() => window.open(`/#${row.pathOrRoute}`, "_blank", "noopener,noreferrer")}
                      >
                        进入
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableShell>
    </AdminPageShell>
  );
}

