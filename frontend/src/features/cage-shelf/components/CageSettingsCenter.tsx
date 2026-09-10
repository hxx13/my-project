import { useMemo, useState } from "react";
import { Database, Lock, ShieldCheck, Eye, UserCheck, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SplitSidebarScrollLayout } from "@/components/layout/ScrollFillLayout";
import type { CageShelfTreeNode } from "@/api/domains/cageShelf.api";
import { hasMinRole } from "@/features/auth/roleAccess";
import { authStorage } from "@/features/auth/authStorage";
import CageOwnerApprovalSettings from "./CageOwnerApprovalSettings";
import CageAuditAssignmentSettings from "./CageAuditAssignmentSettings";
import CageModeVisibilitySettings from "./CageModeVisibilitySettings";
import CageSyncLockSettings from "./CageSyncLockSettings";
import { SettingsSection } from "./SettingsPrimitives";

/**
 * 笼架信息 · 设置中心。
 *
 * 取代原来「4 个 <details> 折叠块 + 整块弹窗下滚」的形态：左侧分类栏固定，
 * 右侧内容区独立滚动（SplitSidebarScrollLayout 自带高度链，两侧各自 overscroll-contain）。
 * 新增一类设置 = 在 CATEGORIES 里加一条 + 在 renderPanel 里加一个分支。
 *
 * 每类带 minRole 门槛：够权限的分类才出现在侧栏，默认选中第一个可见的。
 */

type CategoryKey = "dataSource" | "ownerApproval" | "audit" | "modes" | "syncLock";

const CATEGORIES: Array<{ key: CategoryKey; label: string; description: string; icon: LucideIcon; minRole?: string }> = [
  {
    key: "dataSource",
    label: "数据源",
    description: "笼位详情从 ARO 云端还是本地库读取。切换会清空当前选中项与扫描缓存。",
    icon: Database,
    minRole: "SUPER_ADMIN",
  },
  {
    key: "ownerApproval",
    label: "所属人审核配置",
    description:
      "到位确认 / 分笼审核 / 转移审核三个开关，按所属人维护。任何人都能配自己的；看别人、配别人要管理员及以上。",
    icon: UserCheck,
  },
  {
    key: "audit",
    label: "审核人归属",
    description: "谁负责审批哪个校区/楼层/房间的笼位申请。未分配范围只能由管理员或组长审批。",
    icon: ShieldCheck,
    minRole: "ADMIN",
  },
  {
    key: "modes",
    label: "模式可见性",
    description: "各操作模式对哪些身份可见，以及分笼/转移除占用者本人外还可由哪些身份操作。",
    icon: Eye,
    minRole: "SUPER_ADMIN",
  },
  {
    key: "syncLock",
    label: "同步保护锁",
    description: "同步时跳过哪些范围，以及笼位ID同步方式。",
    icon: Lock,
    minRole: "SUPER_ADMIN",
  },
];

/** 数据源二选一：原先内联在折叠块里，挪进独立分类。 */
function DataSourcePanel({
  dataSource,
  onChange,
}: {
  dataSource: "aro" | "local";
  onChange: (ds: "aro" | "local") => void;
}) {
  return (
    <SettingsSection
      title="数据源"
      description="决定「本地详情」的数据来自哪里。切换后当前选中的笼位、扫描缓存与各操作模式都会重置。"
    >
      <div className="flex items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
        {(
          [
            { key: "aro", label: "ARO 云端" },
            { key: "local", label: "本地库" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={dataSource === opt.key}
            className={`flex-1 rounded-twin-md px-2 py-1.5 text-[11px] font-semibold transition ${
              dataSource === opt.key
                ? "bg-[var(--twin-primary)] text-white"
                : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[var(--twin-mute)]">
        当前：{dataSource === "aro" ? "ARO 云端" : "本地库"}
      </p>
    </SettingsSection>
  );
}

export default function CageSettingsCenter({
  open,
  onOpenChange,
  dataSource,
  onSwitchDataSource,
  fullTree,
  onRunCellIdSync,
  cellIdSyncing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataSource: "aro" | "local";
  onSwitchDataSource: (ds: "aro" | "local") => void;
  fullTree: CageShelfTreeNode[];
  onRunCellIdSync: (deleteExisting: boolean) => void;
  cellIdSyncing: boolean;
}) {
  const role = authStorage.getRole();
  /** 只留下当前角色够权限的分类（minRole 缺省 = 无门槛，能打开设置即可见） */
  const visibleCategories = useMemo(
    () => CATEGORIES.filter((c) => !c.minRole || hasMinRole(role, c.minRole)),
    [role],
  );
  const [active, setActive] = useState<CategoryKey>(
    () => (visibleCategories[0]?.key ?? "ownerApproval") as CategoryKey,
  );
  const current = visibleCategories.find((c) => c.key === active) ?? visibleCategories[0];

  const renderPanel = () => {
    switch (active) {
      case "dataSource":
        return <DataSourcePanel dataSource={dataSource} onChange={onSwitchDataSource} />;
      case "ownerApproval":
        return <CageOwnerApprovalSettings />;
      case "audit":
        return <CageAuditAssignmentSettings />;
      case "modes":
        return <CageModeVisibilitySettings />;
      case "syncLock":
        return (
          <CageSyncLockSettings
            fullTree={fullTree}
            onRunCellIdSync={onRunCellIdSync}
            cellIdSyncing={cellIdSyncing}
          />
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[var(--z-modal)] flex h-[82vh] max-h-[82vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-[var(--twin-hairline)] px-5 py-3.5 text-left">
          <DialogTitle className="text-[14px] text-[var(--twin-ink)]">设置中心</DialogTitle>
          <DialogDescription className="text-[11px] text-[var(--twin-mute)]">
            数据源 / 所属人审核配置 / 审核人归属 / 模式可见性 / 同步保护锁
          </DialogDescription>
        </DialogHeader>

        <SplitSidebarScrollLayout
          className="min-h-0 flex-1"
          sidebarClassName="w-44 shrink-0 border-r border-[var(--twin-hairline)] p-2"
          sidebar={
            <nav className="space-y-0.5">
              {visibleCategories.map((c) => {
                const on = c.key === active;
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActive(c.key)}
                    data-active={on}
                    className={`flex w-full items-center gap-2 rounded-twin-sm px-2.5 py-2 text-left text-[11px] transition ${
                      on
                        ? "bg-[var(--app-color-surface-hover)] font-semibold text-[var(--app-color-text-primary)]"
                        : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </button>
                );
              })}
            </nav>
          }
          contentClassName="px-4 py-4"
        >
          <div className="mb-4 border-b border-[var(--twin-hairline)] pb-3">
            <h3 className="text-[13px] font-semibold text-[var(--twin-ink)]">{current.label}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--twin-mute)]">{current.description}</p>
          </div>
          {renderPanel()}
        </SplitSidebarScrollLayout>
      </DialogContent>
    </Dialog>
  );
}
