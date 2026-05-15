import {
  BookOpen,
  Bug,
  ChevronRight,
  Clipboard,
  ClipboardPaste,
  ExternalLink,
  KeyRound,
  Link2,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldAlert,
  Tags,
  TextSelect,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import type { PublicPagePermissionNode } from "@/api/domains/pagePermission.api";
import {
  createContactGroup,
  deleteContactGroup,
  fetchContactGroups,
  setContactAssignment,
  type ContactGroup,
} from "@/api/domains/chat.api";
import {
  adminChromeCopyPageUrl,
  adminChromeCopySelectionOrPageUrl,
  adminChromePasteIntoFocused,
  adminChromeSelectAllInContext,
} from "@/features/admin/adminChromeClipboard";
import { AdminEntryPermQuickSection } from "@/features/admin/AdminEntryPermQuickSection";
import { ADMIN_STAFF_CONTACTS_REFRESH_EVENT } from "@/features/admin/adminPendingBadgesEvents";
import type {
  AdminFriendRowContextMenuTarget,
  AdminNavContextMenuTarget,
  AdminSensitiveContextMenuTarget,
} from "@/features/admin/adminChromeContextMenuTarget";
import { authStorage } from "@/features/auth/authStorage";
import { canAccessWebPage } from "@/features/auth/pagePermissionAccess";
import { hasMinRole } from "@/features/auth/roleAccess";
import { cn } from "@/lib/utils";

const FRIENDS_PATH = "/admin/staff-messages";

const CTX_SCROLL_NONE =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-auto overscroll-contain";

const SUB_GAP = 6;
const SUB_PANEL_W = 280;
const VIEW_MARGIN = 8;

/** 以 (px,py) 为锚点（通常为光标）放置菜单：超出则向左/向上翻转，保证落在视口内 */
function fitMenuAtPoint(px: number, py: number, width: number, height: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = VIEW_MARGIN;

  let left = px;
  if (left + width > vw - m) {
    left = px - width;
  }
  if (left < m) left = m;
  if (left + width > vw - m) left = Math.max(m, vw - m - width);

  let top = py;
  if (top + height > vh - m) {
    const flippedUp = py - height;
    if (flippedUp >= m) top = flippedUp;
    else top = Math.max(m, vh - m - height);
  }
  if (top < m) top = m;
  if (top + height > vh - m) top = Math.max(m, vh - m - height);

  return { left, top };
}

/** 子面板贴在主列右侧（或左侧）；垂直与主列对齐，超出则对齐主列底部或贴视口 */
function fitSubPanelNextToRoot(root: DOMRect, subWidth: number, subHeight: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = VIEW_MARGIN;

  let left = root.right + SUB_GAP;
  if (left + subWidth > vw - m) {
    left = root.left - subWidth - SUB_GAP;
  }
  left = Math.max(m, Math.min(left, vw - subWidth - m));

  let top = root.top;
  if (top + subHeight > vh - m) {
    const alignBottom = root.bottom - subHeight;
    if (alignBottom >= m) top = alignBottom;
    else top = Math.max(m, vh - m - subHeight);
  }
  if (top < m) top = m;
  if (top + subHeight > vh - m) top = Math.max(m, vh - m - subHeight);

  return { left, top };
}

export type AdminChromeContextMenuPayload = {
  x: number;
  y: number;
  nav: AdminNavContextMenuTarget | null;
  sensitive: AdminSensitiveContextMenuTarget | null;
  friend: AdminFriendRowContextMenuTarget | null;
};

export type AdminChromeContextMenuProps = {
  open: boolean;
  payload: AdminChromeContextMenuPayload | null;
  permNodes: PublicPagePermissionNode[];
  role: string;
  onClose: () => void;
  onOpenEntryInSettings: (path: string) => void;
  onOpenSensitiveInSettings: () => void;
  onSavedEntryPerm?: () => void | Promise<void>;
  /** 便民：打开命令面板（Ctrl+K） */
  onOpenCommandPalette?: () => void;
};

type ActiveSub = null | "entryPerm" | "sensitive";

function MenuRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Clipboard;
  label: string;
  onClick: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-100 hover:bg-white/10"
      onClick={() => void onClick()}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
      </span>
    </button>
  );
}

function SubFlyoutRow({
  active,
  label,
  disabled,
  accent = "violet",
  onClick,
}: {
  active: boolean;
  label: string;
  disabled?: boolean;
  accent?: "violet" | "amber";
  onClick: () => void;
}) {
  const activeCls =
    accent === "amber"
      ? active && !disabled
        ? "bg-amber-600/25 text-amber-100"
        : ""
      : active && !disabled
        ? "bg-violet-600/25 text-violet-100"
        : "";
  const chevronCls =
    accent === "amber"
      ? active && !disabled
        ? "text-amber-200"
        : "text-slate-400"
      : active && !disabled
        ? "text-violet-200"
        : "text-slate-400";
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
        disabled ? "cursor-not-allowed text-slate-500" : "text-slate-100 hover:bg-white/10",
        activeCls
      )}
      onClick={onClick}
    >
      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", chevronCls)} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
      </span>
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}

/**
 * 后台整页自定义右键：主列入口权限优先；详情在右侧接力子面板；剪贴板/便民/调试在主列（内部能力按角色收紧）。
 */
export function AdminChromeContextMenu({
  open,
  payload,
  permNodes,
  role,
  onClose,
  onOpenEntryInSettings,
  onOpenSensitiveInSettings,
  onSavedEntryPerm,
  onOpenCommandPalette,
}: AdminChromeContextMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [activeSub, setActiveSub] = useState<ActiveSub>(null);
  const [rootPos, setRootPos] = useState<{ left: number; top: number } | null>(null);
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null);
  const [friendMenuGroups, setFriendMenuGroups] = useState<ContactGroup[]>([]);
  const [friendGroupTablesOk, setFriendGroupTablesOk] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const canFriendPage = useMemo(
    () => hasMinRole(role, "STAFF") && canAccessWebPage(permNodes, FRIENDS_PATH, role, "STAFF"),
    [permNodes, role]
  );

  useEffect(() => {
    if (!open || !payload?.friend || !canFriendPage) {
      setFriendMenuGroups([]);
      setFriendGroupTablesOk(false);
      return;
    }
    let alive = true;
    void fetchContactGroups()
      .then((g) => {
        if (!alive) return;
        setFriendMenuGroups(g);
        setFriendGroupTablesOk(true);
      })
      .catch(() => {
        if (!alive) return;
        setFriendMenuGroups([]);
        setFriendGroupTablesOk(false);
      });
    return () => {
      alive = false;
    };
  }, [open, payload?.friend?.peerUserId, canFriendPage]);

  const canFriendGroupOps = Boolean(payload?.friend) && canFriendPage && friendGroupTablesOk;

  useEffect(() => {
    if (!open) {
      setActiveSub(null);
      setNewGroupOpen(false);
      setNewGroupName("");
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !payload || !rootRef.current) {
      setRootPos(null);
      setSubPos(null);
      return;
    }
    const rootEl = rootRef.current;
    const rr = rootEl.getBoundingClientRect();
    setRootPos(fitMenuAtPoint(payload.x, payload.y, rr.width, rr.height));

    if (!activeSub) {
      setSubPos(null);
      return;
    }
    const subEl = subRef.current;
    const placeSub = () => {
      if (!rootRef.current || !subRef.current) return;
      const rr2 = rootRef.current.getBoundingClientRect();
      const sr = subRef.current.getBoundingClientRect();
      setSubPos(fitSubPanelNextToRoot(rr2, sr.width, sr.height));
    };
    if (subEl) {
      placeSub();
    } else {
      requestAnimationFrame(placeSub);
    }
  }, [open, payload, activeSub, role]);

  if (!open || !payload) return null;

  const canStaff = hasMinRole(role, "STAFF");
  const canConfigureEntryPerm = hasMinRole(role, "SUPER_ADMIN");
  const canSuperDebug = hasMinRole(role, "SUPER_ADMIN");
  const sensitiveOk = payload.sensitive ? hasMinRole(role, payload.sensitive.configureMinRole) : false;

  const rootStylePos = rootPos ?? { left: payload.x, top: payload.y };

  const toggleSub = (next: Exclude<ActiveSub, null>) => {
    setActiveSub((prev) => (prev === next ? null : next));
  };

  const submitNewGroup = async () => {
    const raw = newGroupName.trim();
    if (!raw) {
      toast.error("请输入分组名称");
      return;
    }
    try {
      await createContactGroup(raw);
      toast.success("已新建分组");
      window.dispatchEvent(new Event(ADMIN_STAFF_CONTACTS_REFRESH_EVENT));
      setNewGroupOpen(false);
      setNewGroupName("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[280]"
        aria-hidden
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={rootRef}
        data-admin-chrome-ctx-surface
        role="menu"
        aria-label="后台快捷菜单"
        className={cn(
          "fixed z-[290] flex w-[13rem] max-w-[min(100vw-1rem,13rem)] flex-col overflow-hidden rounded-lg border border-slate-600 bg-slate-900 text-sm shadow-2xl",
          "max-h-[min(100dvh-1rem,28rem)]",
          CTX_SCROLL_NONE
        )}
        style={{ left: rootStylePos.left, top: rootStylePos.top }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="shrink-0 border-b border-white/10 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <MousePointerClick className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            后台快捷菜单
          </div>
        </div>

        <div className="min-h-0 flex-1 px-1 py-1">
          {payload.nav && canConfigureEntryPerm ? (
            <>
              <SectionLabel>入口权限</SectionLabel>
              <SubFlyoutRow active={activeSub === "entryPerm"} label="入口权限（快捷）" onClick={() => toggleSub("entryPerm")} />
            </>
          ) : null}

          {payload.sensitive && sensitiveOk ? (
            <>
              <SectionLabel>敏感操作</SectionLabel>
              <SubFlyoutRow
                active={activeSub === "sensitive"}
                accent="amber"
                label={`敏感操作 · ${payload.sensitive.label}`}
                onClick={() => toggleSub("sensitive")}
              />
            </>
          ) : null}

          {canFriendGroupOps && payload.friend ? (
            <>
              <SectionLabel>好友分组</SectionLabel>
              {(payload.friend.contactGroupId || "").trim() ? (
                <MenuRow
                  icon={Tags}
                  label="移出分组"
                  onClick={async () => {
                    try {
                      await setContactAssignment(payload.friend!.peerUserId, null);
                      toast.success("已更新");
                      window.dispatchEvent(new Event(ADMIN_STAFF_CONTACTS_REFRESH_EVENT));
                      onClose();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "保存失败");
                    }
                  }}
                />
              ) : null}
              {friendMenuGroups
                .filter((g) => (payload.friend!.contactGroupId || "").trim() !== g.id)
                .map((g) => (
                  <MenuRow
                    key={g.id}
                    icon={Tags}
                    label={`加入「${g.name}」`}
                    onClick={async () => {
                      try {
                        await setContactAssignment(payload.friend!.peerUserId, g.id);
                        toast.success("已更新");
                        window.dispatchEvent(new Event(ADMIN_STAFF_CONTACTS_REFRESH_EVENT));
                        onClose();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "保存失败");
                      }
                    }}
                  />
                ))}
              <MenuRow
                icon={Tags}
                label="新建分组"
                onClick={() => {
                  setNewGroupName("");
                  setNewGroupOpen(true);
                }}
              />
              {friendMenuGroups.map((g) => (
                <MenuRow
                  key={`del-${g.id}`}
                  icon={Tags}
                  label={`删除「${g.name}」`}
                  onClick={async () => {
                    if (!window.confirm(`删除分组「${g.name}」？组内联系人将变为未分组。`)) return;
                    try {
                      await deleteContactGroup(g.id);
                      toast.success("已删除分组");
                      window.dispatchEvent(new Event(ADMIN_STAFF_CONTACTS_REFRESH_EVENT));
                      onClose();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "删除失败");
                    }
                  }}
                />
              ))}
            </>
          ) : null}

          <SectionLabel>剪贴板</SectionLabel>
          <MenuRow
            icon={Clipboard}
            label="复制"
            onClick={async () => {
              try {
                await adminChromeCopySelectionOrPageUrl();
                toast.success("已复制");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "复制失败");
              }
            }}
          />
          <MenuRow
            icon={ClipboardPaste}
            label="粘贴"
            onClick={async () => {
              try {
                await adminChromePasteIntoFocused();
                toast.success("已粘贴");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "粘贴失败");
              }
            }}
          />
          <MenuRow
            icon={TextSelect}
            label="全选"
            onClick={() => {
              try {
                adminChromeSelectAllInContext();
                toast.success("已尝试全选");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "全选失败");
              }
            }}
          />
          <MenuRow
            icon={Link2}
            label="复制页面链接"
            onClick={async () => {
              try {
                await adminChromeCopyPageUrl();
                toast.success("已复制链接");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "复制失败");
              }
            }}
          />

          {canStaff ? (
            <>
              <SectionLabel>便民</SectionLabel>
              <MenuRow
                icon={ExternalLink}
                label="新标签打开当前页"
                onClick={() => {
                  window.open(window.location.href, "_blank", "noopener,noreferrer");
                  onClose();
                }}
              />
              {onOpenCommandPalette ? (
                <MenuRow
                  icon={Search}
                  label="打开命令面板"
                  onClick={() => {
                    onOpenCommandPalette();
                    onClose();
                  }}
                />
              ) : null}
              <MenuRow
                icon={RefreshCw}
                label="刷新页面"
                onClick={() => {
                  if (window.confirm("确认刷新当前页？")) window.location.reload();
                }}
              />
            </>
          ) : null}

          {canSuperDebug ? (
            <>
              <SectionLabel>调试</SectionLabel>
              <MenuRow
                icon={ShieldAlert}
                label="复制路由路径"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`${location.pathname}${location.search}`);
                    toast.success("已复制路径");
                    onClose();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "复制失败");
                  }
                }}
              />
              <MenuRow
                icon={Bug}
                label="复制调试摘要"
                onClick={async () => {
                  try {
                    const blob = {
                      pathname: `${location.pathname}${location.search}`,
                      role: authStorage.getRole() || "",
                      href: window.location.href,
                    };
                    await navigator.clipboard.writeText(JSON.stringify(blob, null, 2));
                    toast.success("已复制");
                    onClose();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "复制失败");
                  }
                }}
              />
              <MenuRow
                icon={BookOpen}
                label="打开接口中心"
                onClick={() => {
                  navigate("/admin/api-docs");
                  onClose();
                }}
              />
              <MenuRow
                icon={KeyRound}
                label="打开页面权限设置"
                onClick={() => {
                  navigate("/admin/page-permissions");
                  onClose();
                }}
              />
            </>
          ) : null}
        </div>
      </div>

      {activeSub && payload.nav && canConfigureEntryPerm && activeSub === "entryPerm" ? (
        <div
          ref={subRef}
          data-admin-chrome-ctx-surface
          className={cn(
            "fixed z-[291] flex w-[17.5rem] max-w-[min(100vw-1rem,17.5rem)] flex-col overflow-hidden rounded-lg border border-violet-500/40 bg-slate-900 text-sm shadow-2xl",
            "max-h-[min(100dvh-1rem,28rem)]",
            CTX_SCROLL_NONE,
            !subPos && "pointer-events-none opacity-0"
          )}
          style={{
            left: subPos?.left ?? 0,
            top: subPos?.top ?? 0,
            width: SUB_PANEL_W,
            ...(subPos ? {} : { visibility: "hidden" as const }),
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="shrink-0 border-b border-violet-500/25 bg-violet-950/40 px-3 py-2">
            <div className="text-xs font-semibold text-violet-100">入口权限（快捷）</div>
          </div>
          <div className="min-h-0 flex-1 px-2 py-2">
            <AdminEntryPermQuickSection
              path={payload.nav.path}
              entryLabel={payload.nav.label}
              canConfigure={canConfigureEntryPerm}
              onOpenInSettingsPage={(p) => {
                onOpenEntryInSettings(p);
                onClose();
              }}
              onSaved={onSavedEntryPerm}
            />
          </div>
        </div>
      ) : null}

      {newGroupOpen ? (
        <div
          className="fixed inset-0 z-[296] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-chrome-new-group-title"
          onClick={() => setNewGroupOpen(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            data-admin-chrome-ctx-surface
            className="w-full max-w-sm rounded-lg border border-slate-600 bg-slate-900 p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div id="admin-chrome-new-group-title" className="mb-2 text-xs font-semibold text-slate-200">
              新建分组
            </div>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setNewGroupOpen(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitNewGroup();
                }
              }}
              placeholder="分组名称"
              autoFocus
              className="mb-3 w-full rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-600 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10"
                onClick={() => setNewGroupOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-500"
                onClick={() => void submitNewGroup()}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeSub && payload.sensitive && sensitiveOk && activeSub === "sensitive" ? (
        <div
          ref={subRef}
          data-admin-chrome-ctx-surface
          className={cn(
            "fixed z-[291] flex w-[17.5rem] max-w-[min(100vw-1rem,17.5rem)] flex-col overflow-hidden rounded-lg border border-amber-500/35 bg-slate-900 text-sm shadow-2xl",
            "max-h-[min(100dvh-1rem,24rem)]",
            CTX_SCROLL_NONE,
            !subPos && "pointer-events-none opacity-0"
          )}
          style={{
            left: subPos?.left ?? 0,
            top: subPos?.top ?? 0,
            width: SUB_PANEL_W,
            ...(subPos ? {} : { visibility: "hidden" as const }),
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="shrink-0 border-b border-amber-500/25 bg-amber-950/35 px-3 py-2">
            <div className="text-xs font-semibold text-amber-100">敏感操作 · {payload.sensitive.label}</div>
          </div>
          <div className="px-3 py-2">
            <button
              type="button"
              className="w-full rounded border border-amber-400/40 bg-amber-950/40 px-2 py-1.5 text-left text-[11px] font-medium text-amber-100 hover:bg-amber-950/60"
              onClick={() => {
                onOpenSensitiveInSettings();
                onClose();
              }}
            >
              打开页面权限设置
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
