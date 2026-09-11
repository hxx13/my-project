import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, X } from "lucide-react";

/** 抽屉顶距与层级：常驻标签要和抽屉把手落在同一条线上 */
export const CAGE_DRAWER_TOP = 72;
/** 高于 --z-modal(800)，否则被规格弹窗遮罩盖住点不到 */
export const CAGE_DRAWER_Z = 900;
/** 最右「笼位分配」列宽度：出现时抽屉向左撑开这么多（够放格子+数量即可，不放空） */
export const ALLOC_COLUMN_WIDTH = 218;
/** 把手相对抽屉顶部的位置，常驻标签要对齐 */
const HANDLE_OFFSET = 24;

/**
 * 常驻右边缘小标签 —— 抽屉关掉（或还没打开过）时留在边框上，随时点开。
 *
 * 只留一个展开箭头，不做竖排文字：它是个常驻控件，越轻越好。
 * 抽屉打开时由页面隐藏本标签，改由抽屉自己的把手负责收起，避免两个把手并排。
 */
export function CagePickerTab({
  label,
  onClick,
  zIndex = CAGE_DRAWER_Z,
}: {
  /** 仅用于 title 提示 */
  label: string;
  onClick: () => void;
  zIndex?: number;
}) {
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      title={`展开${label}`}
      aria-label={`展开${label}`}
      style={{ position: "fixed", top: CAGE_DRAWER_TOP + HANDLE_OFFSET, right: 0, zIndex }}
      className="flex h-9 w-5 items-center justify-center rounded-l-twin-md border border-r-0 border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-mute)] shadow hover:text-[var(--twin-ink)]"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
    </button>,
    document.body,
  );
}

/**
 * 右侧收纳抽屉壳 —— 视觉与交互复刻 cage-shelf 的 BatchTransferPanel（批量转移面板），
 * 但**刻意不共用那个组件**：那边绑死了 dnd-kit 配对逻辑，这里是通用容器。
 *
 * 样式口径保持一致：贴右固定 400px、圆角只留左侧、twin 令牌描边与底色、
 * 左上角竖排收纳把手、头/身/脚三段。
 */
export default function CagePickerDrawer({
  title,
  badge,
  countText,
  hint,
  collapseLabel,
  onClose,
  headerExtra,
  children,
  footer,
  rightColumn,
  zIndex = 40,
  width = 400,
  embedded = false,
}: {
  /** 头部徽标文字；与 title 一起可省略（省略则整个头部不渲染，只留关闭按钮） */
  badge?: string;
  /** 头部标题文字 */
  title?: string;
  /** 标题右侧计数文字（如「已选 2 / 3」） */
  countText?: string;
  /** 标题下方的说明文字 */
  hint?: string;
  /** 收起后竖排标签上的文字 */
  collapseLabel: string;
  onClose?: () => void;
  /** 头部额外操作区（放在关闭按钮左侧） */
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * 最右列内容（笼位分配排序区）。传了就出现，抽屉整体向左撑开一列宽。
   * 「选中笼位后在抽屉最右侧展开排序」就是靠这个，不是另起一栏。
   */
  rightColumn?: ReactNode;
  /**
   * 层级。默认 40 与原批量转移面板一致（页面内浮层）；
   * 但要叠在规格弹窗上时必须调高——弹窗遮罩是 --z-modal(800)，
   * 留在 40 会被遮罩整个盖住、点不到笼位。
   */
  zIndex?: number;
  /** 抽屉宽度。默认 400 与原批量转移面板一致；笼架格子密，选用时放宽。 */
  width?: number;
  /**
   * 与规格弹窗同处一个文档流时置 true：不再自己 fixed + portal，
   * 而是当外层 flex 容器的子元素，两者并排、互不遮盖。
   * 此时不渲染收纳把手（抽屉不再是浮动层，没有「收起露边」的语义）。
   */
  embedded?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  /**
   * 最右列（笼位分配）出现时抽屉整体向左撑开——
   * 「选中笼位后在抽屉最右侧展开排序区」就是这个效果，不用另起一栏。
   */
  const allocWidth = rightColumn ? ALLOC_COLUMN_WIDTH : 0;
  const totalWidth = width + allocWidth;
  /** 收起后只留把手露在外面，横向偏移 = 宽度 - 把手宽度 */
  const collapsedX = totalWidth - 28;

  const headerRow = (
    <div className="flex items-center gap-2">
      {badge && (
        <span className="rounded-twin-md bg-[var(--twin-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
          {badge}
        </span>
      )}
      {title && <span className="text-[12px] font-semibold text-[var(--twin-ink)]">{title}</span>}
      {countText && <span className="text-[11px] text-[var(--twin-mute)]">{countText}</span>}
      {headerExtra}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
  const hasHeader = !!(badge || title || countText || headerExtra || onClose);

  const inner = (
    <>
      {hasHeader && (
        <header className="shrink-0 border-b border-[var(--twin-hairline)] px-4 py-3">
          {headerRow}
          {hint && <p className="mt-1 text-[11px] leading-snug text-[var(--twin-mute)]">{hint}</p>}
        </header>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">{children}</div>
        {rightColumn && (
          <div
            style={{ width: ALLOC_COLUMN_WIDTH }}
            className="flex min-h-0 shrink-0 flex-col border-l border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]"
          >
            {rightColumn}
          </div>
        )}
      </div>

      {footer && <footer className="shrink-0 border-t border-[var(--twin-hairline)] px-4 py-3">{footer}</footer>}
    </>
  );

  if (embedded) {
    return (
      <aside
        /* 桌面按设计宽度；窄视口下按 62vw 收窄，否则 shrink-0 的抽屉会把并排的规格弹窗挤到负坐标互相遮盖 */
        style={{ width: `min(${totalWidth}px, 62vw)` }}
        className="flex h-full min-w-0 shrink-0 flex-col rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-2xl"
      >
        {inner}
      </aside>
    );
  }

  return createPortal(
    <motion.aside
      initial={{ x: totalWidth + 20, opacity: 0 }}
      animate={{ x: collapsed ? collapsedX : 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      style={{ position: "fixed", top: CAGE_DRAWER_TOP, right: 0, bottom: 12, width: totalWidth, zIndex }}
      className="flex flex-col rounded-l-twin-xl border border-r-0 border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-2xl"
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? `展开${collapseLabel}` : "收起"}
        className="absolute -left-6 top-6 flex h-16 w-6 flex-col items-center justify-center gap-0.5 rounded-l-twin-md border border-r-0 border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
      >
        {collapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="text-[9px] leading-none [writing-mode:vertical-rl]">{collapseLabel}</span>
      </button>

      {!collapsed && inner}
    </motion.aside>,
    document.body,
  );
}
