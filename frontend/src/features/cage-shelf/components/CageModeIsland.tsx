import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import "../cage-mode-glow.css";
import {
  Eye,
  LayoutGrid,
  CalendarClock,
  PencilLine,
  CheckCircle2,
  Archive,
  BookmarkPlus,
  History,
  Hand,
  UserCheck,
  Shapes,
  type LucideIcon,
} from "lucide-react";

export type CageModeKey =
  | "view"
  | "allocate"
  | "booking"
  | "edit"
  | "confirm"
  | "archive"
  | "reserve"
  | "record"
  | "division"
  /** 学生端专有：申请预约（教职工的 allocate/reserve 是另一条链） */
  | "studentClaim";

export interface CageModeMeta {
  key: CageModeKey;
  label: string;
  /** 一句话说清这个模式干什么 —— 光看名字看不出来 */
  desc: string;
  icon: LucideIcon;
  /** 空串 = 不做颜色提示（查看模式） */
  color: string;
}

/** 模式元数据：颜色只用于「当前模式」的高亮与笼架呼吸灯，不参与网格单元格配色 */
export const CAGE_MODE_META: CageModeMeta[] = [
  { key: "view", label: "查看", desc: "浏览笼位与占用情况，不做任何修改", icon: Eye, color: "" },
  { key: "allocate", label: "分配", desc: "给空笼位指定 AUP 与占用者", icon: LayoutGrid, color: "#3b82f6" },
  { key: "booking", label: "预约", desc: "按房间维护 AUP 额度与预约明细", icon: CalendarClock, color: "#06b6d4" },
  { key: "edit", label: "状态", desc: "修改笼位的状态标记与表单字段", icon: PencilLine, color: "#f59e0b" },
  { key: "confirm", label: "确认", desc: "核对扫码结果，确认笼位到位", icon: CheckCircle2, color: "#10b981" },
  { key: "archive", label: "归档", desc: "把笼位归档为空笼盒", icon: Archive, color: "#64748b" },
  { key: "reserve", label: "预定", desc: "为指定人员预留笼位（免审核）", icon: BookmarkPlus, color: "#8b5cf6" },
  { key: "record", label: "记录", desc: "查看该笼位的操作与变更留痕", icon: History, color: "#ec4899" },
  { key: "division", label: "划分", desc: "把空笼位预分给本课题组指定人员，划分后仅本人可申请使用", icon: UserCheck, color: "#e11d48" },
  { key: "studentClaim", label: "申请预约", desc: "勾选可用的空笼位，提交预约申请", icon: Hand, color: "#0d9488" },
];

/** 悬浮岛形态 —— 两端共用同一个选择，用户在管理端选的形态在学生端也生效 */
const ISLAND_VARIANT_KEY = "cage.modeIsland.variant";

export function useIslandVariant(): ["dock" | "radial", () => void] {
  const [variant, setVariant] = useState<"dock" | "radial">(() => {
    try {
      return localStorage.getItem(ISLAND_VARIANT_KEY) === "radial" ? "radial" : "dock";
    } catch {
      return "dock";
    }
  });
  const toggle = useCallback(() => {
    setVariant((v) => {
      const next = v === "dock" ? "radial" : "dock";
      try {
        localStorage.setItem(ISLAND_VARIANT_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [variant, toggle];
}

export function modeMetaOf(key: CageModeKey): CageModeMeta {
  return CAGE_MODE_META.find((m) => m.key === key) ?? CAGE_MODE_META[0];
}

/** 笼架呼吸灯颜色：查看模式不给颜色 */
export function modeBorderColor(key: CageModeKey): string {
  return modeMetaOf(key).color;
}

type Props = {
  current: CageModeKey;
  /** 有权限的模式（来自 /api/cage-mode/visible） */
  allowed: string[];
  onPick: (k: CageModeKey) => void;
  variant: "dock" | "radial";
  /**
   * 径向形态挂在哪个角。移动端右下角已被「扫码定位」悬浮按钮占用，
   * 且底部有 tab bar，所以传 left 挂到左下角、并用 bottomOffset 让开 tab bar。
   */
  side?: "left" | "right";
  /** 距底部的偏移（px）：移动端要加上底部 tab bar 的高度 */
  bottomOffset?: number;
  /**
   * 锚点元素 —— 悬浮岛挂在这个元素的范围内（右侧内容区），
   * 而不是整个视口。否则左侧入口列表也算进来，岛就偏向一边了。
   */
  anchorRef?: RefObject<HTMLElement | null>;
  /** 临时：切换形态对比效果用，定稿后删掉 */
  onToggleVariant?: () => void;
};

/** 量锚点元素的视口矩形（右侧内容区）；窗口/容器尺寸变化时跟手 */
function useAnchorRect(ref?: RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, width: r.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [ref]);
  return rect;
}

/**
 * 模式悬浮岛 —— 两种形态共用同一份模式元数据与说明。
 *
 * dock  ：横向胶囊，常驻可见，悬停放大
 * radial：圆钮，点开按**左下→左上**一段圆弧展开（右下角锚点只往可见方向铺，
 *         铺满 360° 会有一半跑到屏幕外或压住锚点）
 *
 * 两者旁边都挂一个说明气泡，显示「悬停中 / 当前」模式的名称与用途。
 */
export default function CageModeIsland({
  current,
  allowed,
  onPick,
  variant,
  anchorRef,
  onToggleVariant,
  side = "right",
  bottomOffset,
}: Props) {
  const modes = CAGE_MODE_META.filter((m) => allowed.includes(m.key));
  const [hovered, setHovered] = useState<CageModeKey | null>(null);
  const rect = useAnchorRect(anchorRef);

  /**
   * 再次点击当前模式 = 退回默认的「查看」模式。
   * 包在这里而不是各页面，两种形态（dock / radial）与三端调用方自动一致。
   */
  const pickMode = (k: CageModeKey) => onPick(k === current ? "view" : k);

  const common = {
    current,
    modes,
    onPick: pickMode,
    onHover: setHovered,
    hovered,
    rect,
    onToggleVariant,
    side,
    bottomOffset,
  };

  return variant === "dock" ? <DockIsland {...common} /> : <RadialIsland {...common} />;
}

type IslandProps = {
  current: CageModeKey;
  modes: CageModeMeta[];
  onPick: (k: CageModeKey) => void;
  onHover: (k: CageModeKey | null) => void;
  /** 悬停中的模式；只在这时弹说明，不常驻占位 */
  hovered: CageModeKey | null;
  rect: { left: number; width: number } | null;
  onToggleVariant?: () => void;
  side?: "left" | "right";
  bottomOffset?: number;
};

/* ══════════════════════════ 形态一：横向悬浮岛 ══════════════════════════ */

function DockIsland({ current, modes, onPick, onHover, hovered, rect, onToggleVariant }: IslandProps) {
  // 以右侧内容区为锚：宽度取内容区宽度，左边界取内容区左边界 —— 不是整页居中
  const anchor: CSSProperties = rect
    ? { left: rect.left, width: rect.width }
    : { left: 0, width: "100%" };

  return (
    <div
      style={{ ...anchor, position: "fixed", bottom: 20 }}
      className="pointer-events-none z-30 flex flex-col items-center gap-2"
    >
      {hovered && <Caption meta={modeMetaOf(hovered)} />}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="pointer-events-auto flex items-center gap-1 rounded-twin-xl border border-[var(--twin-hairline)] bg-[color-mix(in_srgb,var(--twin-canvas)_85%,transparent)] px-2 py-1.5 shadow-[0_10px_40px_-10px_rgba(15,23,42,0.35)] backdrop-blur-md"
      >
        {modes.map((m) => {
          const active = m.key === current;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onPick(m.key)}
              onMouseEnter={() => onHover(m.key)}
              onMouseLeave={() => onHover(null)}
              title={m.label}
              className={`group relative flex h-10 items-center gap-1.5 rounded-twin-lg px-2.5 text-[11px] font-semibold transition-transform duration-150 hover:-translate-y-1.5 hover:scale-105 ${
                active ? "text-white" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
              }`}
              style={active ? { background: m.color || "var(--twin-primary)" } : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={active ? "" : "opacity-80"}>{m.label}</span>
            </button>
          );
        })}
        {onToggleVariant && (
          <button
            type="button"
            onClick={onToggleVariant}
            title="切换悬浮岛形态（试试径向）"
            className="ml-1 grid h-8 w-8 place-items-center rounded-twin-lg text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft-2)] hover:text-[var(--twin-ink)]"
          >
            <Shapes className="h-3.5 w-3.5" />
          </button>
        )}
      </motion.div>
    </div>
  );
}

/* ══════════════════════════ 形态二：径向展开 ══════════════════════════ */

/** 每圈半径递增。一圈能放几个不写死，由该圈弧长推算 */
const RING_RADII = [82, 144, 206, 268];
/** 按钮直径 36 + 间隙，用于把弧长换算成「能排下几个」 */
const SLOT_PITCH = 42;
/** 展开弧的跨度：180°→270°，即圆心在右下角时唯一可见的象限 */
const ARC_SPAN_DEG = 90;
const ARC_START_DEG = 180;

/** 该半径的弧上能排下几个（半径越大放得越多 —— 这就是递增的来源） */
export function ringCapacity(radius: number): number {
  const arcLen = (radius * ARC_SPAN_DEG * Math.PI) / 180;
  return Math.max(1, Math.floor(arcLen / SLOT_PITCH));
}

/** 把 n 个模式逐圈铺开：内圈填满再往外溢，容量逐圈递增 */
export function layoutRings(n: number): number[] {
  const perRing: number[] = [];
  let left = n;
  for (let i = 0; i < RING_RADII.length && left > 0; i++) {
    const cap = Math.min(ringCapacity(RING_RADII[i]), left);
    perRing.push(cap);
    left -= cap;
  }
  return perRing;
}

/** 第 i 个模式落在哪一圈、在弧上的角度与半径（展开与说明定位共用这一套） */
export function ringSlotOf(i: number, perRing: number[]): { ang: number; r: number } {
  let acc = 0;
  for (let ring = 0; ring < perRing.length; ring++) {
    const count = perRing[ring];
    if (i < acc + count) {
      const slot = i - acc;
      const step = count > 1 ? ARC_SPAN_DEG / (count - 1) : 0;
      return { ang: ARC_START_DEG + step * slot, r: RING_RADII[ring] };
    }
    acc += count;
  }
  return { ang: ARC_START_DEG, r: RING_RADII[0] };
}

function RadialIsland({ current, modes, onPick, onHover, hovered, rect, onToggleVariant, side = "right", bottomOffset }: IslandProps) {
  const [open, setOpen] = useState(false);
  const active = modeMetaOf(current);
  const ActiveIcon = active.icon;
  const n = modes.length;

  const rings = layoutRings(n);

  /**
   * 第 i 个模式落在哪一圈、以及该圈弧上的角度与半径（与 CSS 同一套算法）。
   * 基础算法按「右下角锚点、向左上展开」设计；挂左下角时把角度沿竖轴镜像（180-ang），
   * 展开方向就翻成往右上，不会铺到屏幕外。
   */
  const slotOf = (i: number) => {
    const s = ringSlotOf(i, rings);
    return side === "left" ? { ang: 180 - s.ang, r: s.r } : s;
  };

  const rightInset = rect ? Math.max(window.innerWidth - (rect.left + rect.width), 0) : 0;

  // 说明挂在**被悬停的那个点位**旁边，不是固定挂在圆钮上 ——
  // 点位是转过角度的，容器内固定位置会飘到别处、甚至被按钮盖住。
  const hoveredIdx = hovered ? modes.findIndex((m) => m.key === hovered) : -1;
  const captionPos = (() => {
    if (!open || hoveredIdx < 0) return null;
    const { ang, r } = slotOf(hoveredIdx);
    const rad = (ang * Math.PI) / 180;
    return { left: 28 + Math.cos(rad) * r, top: 28 + Math.sin(rad) * r };
  })();

  return (
    <div
      style={{
        position: "fixed",
        ...(side === "left" ? { left: (rect?.left ?? 0) + 16 } : { right: rightInset + 16 }),
        bottom: bottomOffset ?? 16,
      }}
      className="z-30"
    >
      {captionPos && (
        <div
          className="pointer-events-none absolute z-40 w-[200px]"
          style={{
            left: captionPos.left,
            top: captionPos.top,
            transform: side === "left" ? "translate(16px, -50%)" : "translate(calc(-100% - 16px), -50%)",
          }}
        >
          <Caption meta={modeMetaOf(hovered!)} />
        </div>
      )}
      <RadialRoot $open={open}>
        <button
          type="button"
          className="rt-toggle"
          onClick={() => setOpen((v) => !v)}
          title={open ? "收起" : `${active.label} · ${active.desc}`}
          style={{ background: active.color || "var(--twin-canvas)", color: active.color ? "#fff" : "var(--twin-ink)" }}
        >
          {open ? <Shapes className="h-5 w-5" /> : <ActiveIcon className="h-5 w-5" />}
        </button>
        <ul className="rt-ring">
          {modes.map((m, i) => {
            const isActive = m.key === current;
            const Icon = m.icon;
            const { ang, r } = slotOf(i);
            return (
              <li
                key={m.key}
                className="rt-item"
                style={{ "--ang": `${ang}deg`, "--r": `${r}px` } as CSSProperties}
              >
                <button
                  type="button"
                  onClick={() => {
                    onPick(m.key);
                    setOpen(false);
                  }}
                  onMouseEnter={() => onHover(m.key)}
                  onMouseLeave={() => onHover(null)}
                  title={`${m.label} · ${m.desc}`}
                  className="rt-anchor"
                  style={{
                    background: m.color || "var(--twin-canvas-soft)",
                    color: m.color ? "#fff" : "var(--twin-ink)",
                    boxShadow: isActive
                      ? `0 0 0 2px var(--twin-canvas), 0 0 0 5px ${m.color || "var(--twin-primary)"}`
                      : undefined,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </RadialRoot>
      {onToggleVariant && (
        <button
          type="button"
          onClick={onToggleVariant}
          title="切换悬浮岛形态（试试横向）"
          className="absolute bottom-full left-1/2 mb-1 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-mute)] shadow-sm transition hover:text-[var(--twin-ink)]"
        >
          <Shapes className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/**
 * 径向岛（双圈）。收起时圆钮显示**当前模式**的图标与颜色。
 *
 * 角度与半径由 JS 逐点位算好，通过 --ang / --r 传进来。
 * 之前把半径写成父级的 `--radius: calc(··· var(--ring) ···)` 是不行的 ——
 * 父级计算时 --ring 还没定义，整个值失效，点位就永远停在原地。
 */
const RadialRoot = styled.div<{ $open: boolean }>`
  position: relative;
  width: 56px;
  height: 56px;

  .rt-toggle {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    box-shadow:
      0 6px 24px -6px rgba(15, 23, 42, 0.4),
      0 0 0 1px rgba(15, 23, 42, 0.06);
    transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), background 0.25s;
  }
  ${(p) => (p.$open ? ".rt-toggle { transform: rotate(180deg); }" : "")}
  /* 收起时点位全叠在圆钮下面，挡住圆钮的点击也会误触悬停 —— 直接不接事件 */
  ${(p) => (p.$open ? "" : ".rt-item { pointer-events: none; }")}

  .rt-ring {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .rt-item {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    transform-origin: 0 0;
    transform: rotate(var(--ang)) translateX(${(p) => (p.$open ? "var(--r)" : "0px")});
    transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    transition-delay: ${(p) => (p.$open ? "0.02s" : "0s")};
  }

  .rt-anchor {
    position: absolute;
    left: 0;
    top: 0;
    /* 负 margin 把按钮中心压到转轴点，不占用 transform —— transform 只留给反向自转 */
    margin-left: -18px;
    margin-top: -18px;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    transform-origin: 50% 50%;
    /* 反向自转，图标始终正立 */
    transform: rotate(calc(var(--ang) * -1));
    transition:
      transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
      filter 0.18s ease,
      box-shadow 0.18s ease;
    transition-delay: ${(p) => (p.$open ? "0.02s, 0s, 0s" : "0s, 0s, 0s")};
  }
  .rt-anchor:hover {
    filter: brightness(1.08);
  }
`;

/* ══════════════════════════ 说明气泡 ══════════════════════════ */

/** 显示「悬停中，否则当前」模式的名称与用途 */
function Caption({ meta }: { meta: CageModeMeta }) {
  return (
    <motion.div
      key={meta.key}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="pointer-events-none max-w-[220px] rounded-twin-lg border border-[var(--twin-hairline)] bg-[color-mix(in_srgb,var(--twin-canvas)_95%,transparent)] px-3 py-2 text-right shadow-[0_8px_30px_-12px_rgba(15,23,42,0.3)] backdrop-blur-md"
    >
      <div className="flex items-center justify-end gap-1.5">
        {meta.color && <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />}
        <span className="text-[12px] font-semibold text-[var(--twin-ink)]">{meta.label}</span>
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-[var(--twin-mute)]">{meta.desc}</div>
    </motion.div>
  );
}
