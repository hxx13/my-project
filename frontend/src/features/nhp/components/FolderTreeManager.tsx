/**
 * 共享文件夹树管理器 — 对齐 aup-wb-group-hd / aup-wb-row，行内操作为「⋮」折叠菜单。
 *
 * 适用：码表文件夹（扁平）、字段域/子模块（嵌套 children）。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type FolderTreeItem = {
  id: string;
};

export type FolderTreeGroup<T extends FolderTreeItem = FolderTreeItem> = {
  key: string;
  label: string;
  items: T[];
  /** 嵌套子文件夹（如域 → 子模块） */
  children?: FolderTreeGroup<T>[];
  /** false = 系统保留分组（如「未分类」），隐藏重命名/删除 */
  mutable?: boolean;
  /** 文件夹标题旁附加内容（如编码 chip） */
  adornment?: ReactNode;
  /** 分组头样式覆盖（如缩进、字号） */
  headerStyle?: React.CSSProperties;
  /** 空分组提示（覆盖默认 emptyFolder） */
  emptyHint?: string;
  /** 空分组快捷操作文案（覆盖 emptyFolderAction） */
  emptyActionLabel?: string;
  /** 空分组快捷操作类型（默认 createItem） */
  emptyAction?: FolderAction;
};

export type FolderAction = "createItem" | "createFolder" | "rename" | "delete" | "moveItem";

export type FolderTreeManagerLabels = {
  createFolder?: string;
  createItem?: string;
  renameFolder?: string;
  deleteFolder?: string;
  moveItem?: string;
  emptyFolder?: string;
  emptyFolderAction?: string;
  moveModalTitle?: string;
  moveModalHint?: string;
  /** 文件夹行内「新建子项」短标签，如 ＋码表 / ＋字段 */
  folderCreateItemLabel?: string;
  /** 域级「新建子文件夹」标签，如 新建子模块 */
  folderCreateFolderLabel?: string;
};

const DEFAULT_LABELS: Required<FolderTreeManagerLabels> = {
  createFolder: "＋ 新建文件夹",
  createItem: "＋ 新建码表",
  renameFolder: "编辑名称",
  deleteFolder: "删除",
  moveItem: "移动",
  emptyFolder: "尚无内容",
  emptyFolderAction: "新建",
  moveModalTitle: "移动到文件夹",
  moveModalHint: "选择目标文件夹",
  folderCreateItemLabel: "＋码表",
  folderCreateFolderLabel: "新建文件夹",
};

const ICON = {
  createItem: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 2.5h5.2L13 6.3v7.2A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-10A1.5 1.5 0 0 1 4.5 2H4Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9 2.5V6.5H13" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  createFolder: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6l1.2 1.5H12.5A1.5 1.5 0 0 1 14 6v6.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  rename: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10.5 2.5 13.5 5.5 5 14H2v-3L10.5 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  delete: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 4.5h10M6 4.5V3.5h4v1M5.5 4.5v8h5v-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  move: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2 8h12M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} as const;

function defaultFolderActions(_folderKey: string, depth: number): FolderAction[] {
  if (depth === 0) return ["createItem", "createFolder", "rename", "delete"];
  if (depth === 1) return ["createItem", "rename", "delete"];
  return ["rename", "delete"];
}

function defaultItemActions(): FolderAction[] {
  return ["moveItem"];
}

type MenuEntry = {
  action: FolderAction;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function FolderKebabMenu({
  entries,
  menuKey,
  openKey,
  onOpenKey,
}: {
  entries: MenuEntry[];
  menuKey: string;
  openKey: string | null;
  onOpenKey: (key: string | null) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const open = openKey === menuKey;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      onOpenKey(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenKey]);

  if (entries.length === 0) return null;

  return (
    <span className="aup-wb-kebab-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        className="aup-wb-kebab-btn"
        title="更多操作"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onOpenKey(open ? null : menuKey);
        }}
      >
        ⋮
      </button>
      {open && (
        <div className="aup-wb-kebab-menu" role="menu">
          {entries.map((entry) => (
            <button
              key={entry.action}
              type="button"
              role="menuitem"
              className={`aup-wb-kebab-item${entry.danger ? " danger" : ""}`}
              disabled={entry.disabled}
              onClick={(e) => {
                e.stopPropagation();
                onOpenKey(null);
                entry.onClick();
              }}
            >
              <span className="aup-wb-kebab-icon">{entry.icon}</span>
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function FolderGroupHeader({
  group,
  depth,
  count,
  collapsed,
  onToggle,
  canMaintain,
  mutable,
  labels,
  actions,
  handlers,
  deletePending,
  showDelete = true,
  menuKey,
  openMenuKey,
  onOpenMenuKey,
}: {
  group: FolderTreeGroup;
  depth: number;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  canMaintain: boolean;
  mutable: boolean;
  labels: Required<FolderTreeManagerLabels>;
  actions: FolderAction[];
  handlers: {
    onCreateItem?: (folderKey: string) => void;
    onCreateFolder?: (folderKey: string) => void;
    onRename?: (folderKey: string) => void;
    onDelete?: (folderKey: string) => void;
  };
  deletePending?: boolean;
  showDelete?: boolean;
  menuKey: string;
  openMenuKey: string | null;
  onOpenMenuKey: (key: string | null) => void;
}) {
  const entries: MenuEntry[] = [];
  if (canMaintain && mutable) {
    if (actions.includes("createItem") && handlers.onCreateItem) {
      entries.push({
        action: "createItem",
        label: labels.folderCreateItemLabel.replace(/^＋\s*/, ""),
        icon: ICON.createItem,
        onClick: () => handlers.onCreateItem!(group.key),
      });
    }
    if (actions.includes("createFolder") && handlers.onCreateFolder) {
      entries.push({
        action: "createFolder",
        label: labels.folderCreateFolderLabel,
        icon: ICON.createFolder,
        onClick: () => handlers.onCreateFolder!(group.key),
      });
    }
    if (actions.includes("rename") && handlers.onRename) {
      entries.push({
        action: "rename",
        label: labels.renameFolder,
        icon: ICON.rename,
        onClick: () => handlers.onRename!(group.key),
      });
    }
    if (showDelete !== false && actions.includes("delete") && handlers.onDelete) {
      entries.push({
        action: "delete",
        label: labels.deleteFolder,
        icon: ICON.delete,
        danger: true,
        disabled: deletePending,
        onClick: () => handlers.onDelete!(group.key),
      });
    }
  } else if (canMaintain && !mutable && actions.includes("createItem") && handlers.onCreateItem) {
    entries.push({
      action: "createItem",
      label: labels.folderCreateItemLabel.replace(/^＋\s*/, ""),
      icon: ICON.createItem,
      onClick: () => handlers.onCreateItem!(group.key),
    });
  }

  return (
    <div
      className="aup-wb-group-hd"
      style={group.headerStyle}
      onClick={onToggle}
    >
      <span className="chev">{collapsed ? "▸" : "▾"}</span>
      <span className="name" title={group.key}>
        {group.label}
      </span>
      {group.adornment}
      <span className={depth > 0 ? "meta" : "aup-wb-chip muted"} style={depth > 0 ? { fontSize: 11, color: "var(--muted)" } : undefined}>
        {count}
      </span>
      {(entries.length > 0 || canMaintain) && (
        <span className="aup-wb-group-actions">
          <FolderKebabMenu entries={entries} menuKey={menuKey} openKey={openMenuKey} onOpenKey={onOpenMenuKey} />
        </span>
      )}
    </div>
  );
}

export interface FolderTreeManagerProps<T extends FolderTreeItem = FolderTreeItem> {
  folders: FolderTreeGroup<T>[];
  selectedItemId?: string | null;
  onSelectItem: (id: string) => void;
  renderItem: (item: T, folderKey: string, ctx: { selected: boolean }) => ReactNode;
  canMaintain?: boolean;
  loading?: boolean;
  headerHint?: ReactNode;
  emptyState?: ReactNode;
  ungroupedKey?: string;
  labels?: FolderTreeManagerLabels;
  /** 行 data 属性，供 scheduleScrollAsideItem 定位 */
  itemDataAttr?: (item: T) => Record<string, string>;
  itemRowStyle?: React.CSSProperties;
  itemRowClassName?: (item: T, folderKey: string, ctx: { selected: boolean }) => string | undefined;
  onCreateFolder?: (folderKey?: string) => void;
  onCreateItem?: (folderKey: string) => void;
  onRenameFolder?: (folderKey: string) => void;
  onDeleteFolder?: (folderKey: string) => void;
  onMoveItem?: (itemId: string, fromFolderKey: string, toFolderKey: string) => void;
  /** 按文件夹节点配置可用操作 */
  folderActions?: (folderKey: string, depth: number) => FolderAction[];
  /** @deprecated 使用 folderActions */
  getFolderActions?: (folderKey: string, depth: number) => FolderAction[];
  /** 子项行可用操作（默认 moveItem） */
  itemActions?: (itemId: string, folderKey: string) => FolderAction[];
  /** 嵌套模式：在父文件夹下新建子文件夹（等同 onCreateFolder(folderKey)） */
  onCreateSubFolder?: (folderKey: string) => void;
  extraHeaderActions?: ReactNode;
  collapsedFolders?: Set<string>;
  onCollapsedFoldersChange?: (next: Set<string>) => void;
  deleteFolderPending?: boolean;
  /** false = 从 kebab 隐藏删除（非 disable） */
  isFolderDeletable?: (group: FolderTreeGroup, totalCount: number) => boolean;
}

function countGroupItems<T extends FolderTreeItem>(group: FolderTreeGroup<T>): number {
  const childCount = (group.children ?? []).reduce((n, c) => n + countGroupItems(c), 0);
  return group.items.length + childCount;
}

function flattenFolderGroups<T extends FolderTreeItem>(groups: FolderTreeGroup<T>[]): FolderTreeGroup<T>[] {
  const out: FolderTreeGroup<T>[] = [];
  const walk = (list: FolderTreeGroup<T>[]) => {
    for (const g of list) {
      out.push(g);
      if (g.children?.length) walk(g.children);
    }
  };
  walk(groups);
  return out;
}

export default function FolderTreeManager<T extends FolderTreeItem = FolderTreeItem>({
  folders,
  selectedItemId,
  onSelectItem,
  renderItem,
  canMaintain = false,
  loading = false,
  headerHint,
  emptyState,
  ungroupedKey = "未分类",
  labels: labelsProp,
  itemDataAttr,
  itemRowStyle,
  itemRowClassName,
  onCreateFolder,
  onCreateItem,
  onRenameFolder,
  onDeleteFolder,
  onMoveItem,
  folderActions: folderActionsProp,
  getFolderActions,
  itemActions = defaultItemActions,
  onCreateSubFolder,
  extraHeaderActions,
  collapsedFolders: collapsedProp,
  onCollapsedFoldersChange,
  deleteFolderPending,
  isFolderDeletable,
}: FolderTreeManagerProps<T>) {
  const folderActions = folderActionsProp ?? getFolderActions ?? defaultFolderActions;
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const [collapsedInternal, setCollapsedInternal] = useState<Set<string>>(new Set());
  const collapsed = collapsedProp ?? collapsedInternal;
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  const setCollapsed = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      const next = updater(collapsed);
      if (onCollapsedFoldersChange) onCollapsedFoldersChange(next);
      else setCollapsedInternal(next);
    },
    [collapsed, onCollapsedFoldersChange],
  );

  const toggleFolder = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const [moveTarget, setMoveTarget] = useState<{ itemId: string; fromFolderKey: string; itemLabel?: string } | null>(
    null,
  );

  const moveFolderOptions = moveTarget
    ? flattenFolderGroups(folders).filter((f) => f.key !== moveTarget.fromFolderKey)
    : [];

  const showHeader =
    folders.length > 0 && canMaintain && (onCreateFolder || onCreateItem || extraHeaderActions);

  const handleCreateSubFolder = onCreateSubFolder ?? (onCreateFolder ? (key: string) => onCreateFolder(key) : undefined);

  const folderHandlers = {
    onCreateItem,
    onCreateFolder: handleCreateSubFolder,
    onRename: onRenameFolder,
    onDelete: onDeleteFolder,
  };

  const renderGroup = (group: FolderTreeGroup<T>, depth: number): ReactNode => {
    const isCollapsed = collapsed.has(group.key);
    const mutable = group.mutable !== false && group.key !== ungroupedKey;
    const actions = folderActions(group.key, depth);
    const totalCount = countGroupItems(group);
    const hasChildren = (group.children?.length ?? 0) > 0;
    const showDelete = isFolderDeletable ? isFolderDeletable(group, totalCount) : true;
    const canMoveItems = canMaintain && !!onMoveItem && flattenFolderGroups(folders).length > 1;
    const itemIndent = 28 + depth * 16;

    return (
      <div key={group.key}>
        <FolderGroupHeader
          group={group}
          depth={depth}
          count={totalCount}
          collapsed={isCollapsed}
          onToggle={() => toggleFolder(group.key)}
          canMaintain={canMaintain}
          mutable={mutable}
          labels={labels}
          actions={actions}
          handlers={folderHandlers}
          deletePending={deleteFolderPending}
          showDelete={showDelete}
          menuKey={`folder:${group.key}`}
          openMenuKey={openMenuKey}
          onOpenMenuKey={setOpenMenuKey}
        />
        {!isCollapsed && !hasChildren && group.items.length === 0 && (
          <div
            style={{
              padding: `8px 12px 8px ${itemIndent}px`,
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            {group.emptyHint ?? labels.emptyFolder}
            {canMaintain && (() => {
              const act = group.emptyAction ?? "createItem";
              const canAct =
                (act === "createFolder" && actions.includes("createFolder") && folderHandlers.onCreateFolder) ||
                (act === "createItem" && actions.includes("createItem") && folderHandlers.onCreateItem);
              if (!canAct) return null;
              return (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="btn ghost small"
                    style={{ padding: "0 4px", fontSize: 12 }}
                    onClick={() => {
                      if (act === "createFolder") folderHandlers.onCreateFolder!(group.key);
                      else folderHandlers.onCreateItem!(group.key);
                    }}
                  >
                    {group.emptyActionLabel ?? labels.emptyFolderAction}
                  </button>
                </>
              );
            })()}
          </div>
        )}
        {!isCollapsed &&
          group.items.map((item) => {
            const selected = selectedItemId === item.id;
            const dataAttrs = itemDataAttr?.(item) ?? {};
            const rowActions = itemActions(item.id, group.key);
            const itemEntries: MenuEntry[] = [];
            if (canMoveItems && rowActions.includes("moveItem")) {
              itemEntries.push({
                action: "moveItem",
                label: labels.moveItem,
                icon: ICON.move,
                onClick: () => {
                  const row = item as T & { codelist?: { name?: string } };
                  setMoveTarget({
                    itemId: item.id,
                    fromFolderKey: group.key,
                    itemLabel: row.codelist?.name || item.id,
                  });
                },
              });
            }
            const extraClass = itemRowClassName?.(item, group.key, { selected }) ?? "";
            return (
              <div
                key={item.id}
                className={`aup-wb-row${selected ? " on" : ""}${extraClass ? ` ${extraClass}` : ""}`}
                style={{ scrollMarginTop: 12, paddingLeft: itemIndent, ...itemRowStyle }}
                onClick={() => onSelectItem(item.id)}
                {...Object.fromEntries(Object.entries(dataAttrs).map(([k, v]) => [k, v]))}
              >
                {renderItem(item, group.key, { selected })}
                {itemEntries.length > 0 && (
                  <FolderKebabMenu
                    entries={itemEntries}
                    menuKey={`item:${group.key}:${item.id}`}
                    openKey={openMenuKey}
                    onOpenKey={setOpenMenuKey}
                  />
                )}
              </div>
            );
          })}
        {!isCollapsed && (group.children ?? []).map((child) => renderGroup(child, depth + 1))}
      </div>
    );
  };

  return (
    <>
      {loading && (
        <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载中…</div>
      )}
      {!loading && folders.length === 0 && emptyState}
      {showHeader && (
        <div
          style={{
            padding: "10px 12px 8px",
            borderBottom: "1px solid var(--border, #e5e7eb)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {headerHint && (
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>{headerHint}</div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {onCreateFolder && (
              <button type="button" className="btn ghost small" style={{ fontSize: 11 }} onClick={() => onCreateFolder()}>
                {labels.createFolder}
              </button>
            )}
            {onCreateItem && (
              <button
                type="button"
                className="btn ghost small"
                style={{ fontSize: 11 }}
                onClick={() => onCreateItem(ungroupedKey)}
                title={`在「${ungroupedKey}」下新建`}
              >
                {labels.createItem}
              </button>
            )}
            {extraHeaderActions}
          </div>
        </div>
      )}
      {folders.map((folder) => renderGroup(folder, 0))}

      {moveTarget && onMoveItem && (
        <div className="aup-modal-mask" onClick={() => setMoveTarget(null)}>
          <div className="aup-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3>{labels.moveModalTitle}</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              {labels.moveModalHint}
              {moveTarget.itemLabel ? `：${moveTarget.itemLabel}` : ""}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
              {moveFolderOptions.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className="btn ghost"
                  style={{ justifyContent: "flex-start", textAlign: "left" }}
                  onClick={() => {
                    onMoveItem(moveTarget.itemId, moveTarget.fromFolderKey, f.key);
                    setMoveTarget(null);
                  }}
                >
                  {f.key !== f.label ? f.key : f.label}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
                    {countGroupItems(f)}
                  </span>
                </button>
              ))}
            </div>
            <div className="aup-modal-actions">
              <button type="button" className="btn ghost" onClick={() => setMoveTarget(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
