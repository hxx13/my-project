import { useId, useMemo } from "react";
import type { TelemetryTagItem } from "@/telemetry-view/types";
import { Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import "./cockpitRobotArm.css";

/** 与 WinCC 导入变量库一致：变量名/展示名/指标名等任一含「机械臂」即占性能栏一个槽位 */
export function tagItemLooksLikeRobotArm(it: TelemetryTagItem): boolean {
  const blob = `${it.variableName ?? ""}${it.displayLabel ?? ""}${it.metricKindLabel ?? ""}${it.metricKindCode ?? ""}`;
  return blob.includes("机械臂");
}

export function findRobotArmTagItems(tagItems: TelemetryTagItem[] | undefined): TelemetryTagItem[] {
  if (!tagItems?.length) return [];
  const out = tagItems.filter(tagItemLooksLikeRobotArm);
  out.sort((a, b) => String(a.variableName || "").localeCompare(String(b.variableName || ""), "zh-Hans-CN"));
  return out;
}

/** 1=运行中，0=停机；其它可读数字非 0 视为运行 */
export function parseRobotArmRun01(raw: string | null | undefined): boolean | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isFinite(n)) {
    if (n === 1) return true;
    if (n === 0) return false;
    return n !== 0;
  }
  const lo = t.toLowerCase();
  if (lo === "true" || lo === "on") return true;
  if (lo === "false" || lo === "off") return false;
  return null;
}

function displayName(it: TelemetryTagItem): string {
  const a = (it.displayLabel || "").trim();
  const b = (it.metricKindLabel || "").trim();
  const c = (it.variableName || "").trim();
  if (a) return a;
  if (b) return b;
  return c || "机械臂";
}

/** 带纹一格 = 带速（32px / 半周期）下走过一格所需时间，改周期时一起改 */
const BELT_TICK_STEP = 3.6;
const BELT_TICKS = Array.from({ length: 15 }, (_, i) => 28 + i * BELT_TICK_STEP);
const BOX_COLOR = "#fbbf24";

/** 与机械臂性能槽同高的卡片基础样式（边框/底色/内边距），供机械臂槽、动力站、AGV 等复用 */
export const COCKPIT_COMPACT_METRIC_PILL_BASE =
  "pointer-events-auto rounded-lg border border-cyan-500/20 bg-slate-950/85 px-2.5 py-3 shadow-sm backdrop-blur-sm sm:px-3 sm:py-3.5";

/**
 * 顶栏这几张性能卡的高度：**跟着窗口高度伸缩**。
 *
 * 原来写死 `min-h-[13rem]`（208px）—— 短屏上它照样占掉上半屏、把下面的坐标图挤扁；大屏上又纹丝不动。
 * 现在 20vh（1080p ≈ 216px，跟原来基本一致），上下各夹一刀：短屏最矮 10rem，再大的屏最高 16rem。
 *
 * 用 **`height` 而不是 `min-h`**：这几张卡都带 `h-full`（`height:100%`），而 flex 的 `align-items:stretch`
 * 对「已经指定了交叉轴尺寸」的元素不生效 —— 高度只能被算成内容高，于是各卡高度参差不齐
 * （原来靠三张卡写死同一个 `min-h` 才凑齐）。给同一个确定高度，高度也就一起跟着窗口走了。
 *
 * 用内联 style 而不是 Tailwind 任意值：本仓踩过「`w-[…rem]` 没进产物 → 样式静默失效」，
 * 带函数/逗号的任意值更容易漏（栅格宽度当初也是为这个改成内联的）。
 */
export const COCKPIT_METRIC_PILL_SIZE: React.CSSProperties = {
  height: "clamp(10rem, 20vh, 16rem)",
};

const METRICS_PILL_SHELL = cn(
  COCKPIT_COMPACT_METRIC_PILL_BASE,
  /* 不设 max-w：卡片要跟着顶栏余量按比例变宽（设了上限就会把余量推给别的卡，比例就走样） */
  "flex h-full min-h-0 max-h-full min-w-0 shrink flex-col justify-center sm:min-w-[13rem]"
);

/** 性能指标栏 · 单个机械臂槽位（较其它 metricsPill 占位更矮，节省纵向空间） */
export function CockpitRobotArmMetricSlot({
  item,
  slotIndex,
  totalSlots,
}: {
  item: TelemetryTagItem;
  slotIndex: number;
  totalSlots: number;
}) {
  const run = parseRobotArmRun01(item.value ?? null);
  const running = run === true;
  const label = running ? "运行中" : "停机";
  const labelCls = running ? "text-cyan-200" : "text-slate-400";
  const raw = (item.value ?? "").trim();
  const titleBits = [raw ? `WinCC 值：${raw}` : null, item.variableName || null].filter(Boolean).join("\n");

  return (
    <div
      className={cn(METRICS_PILL_SHELL)}
      title={titleBits || undefined}
      /* 权重=本卡基准宽度：顶栏余量按各卡宽度比例分配，宽屏铺满、比例不变 */
      style={{ ...COCKPIT_METRIC_PILL_SIZE, flex: "256 1 256px" }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 py-0.5">
        <div className="flex w-full shrink-0 items-center justify-center gap-1">
          <Cpu className="h-3 w-3 shrink-0 text-cyan-400/80 sm:h-3.5 sm:w-3.5" aria-hidden />
          <span className="truncate text-[11px] font-semibold text-cyan-100/95 sm:text-xs">
            机械臂
            {totalSlots > 1 ? (
              <span className="ml-0.5 font-mono text-[10px] font-normal text-cyan-500/90">
                {slotIndex}/{totalSlots}
              </span>
            ) : null}
          </span>
        </div>
        {/* 图形撑满卡片剩余空间（按自身比例缩放）：卡片随顶栏比例变宽时，机器臂跟着变大 */}
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">
          <CockpitRobotArmShuttleSvg running={running} className="h-full w-full text-cyan-300/90" />
        </div>
        <div className="w-full min-w-0 px-0.5 text-center">
          <div className="line-clamp-2 text-[10px] leading-snug text-slate-500 sm:text-[11px]" title={item.variableName || undefined}>
            {displayName(item)}
          </div>
          <div className={cn("mt-0.5 text-[12px] font-semibold sm:text-[13px]", labelCls)}>{label}</div>
        </div>
      </div>
    </div>
  );
}

type SlotsProps = {
  tagItems: TelemetryTagItem[] | undefined;
};

/** 性能栏：有几个含「机械臂」的变量就渲染几个槽位 */
export function CockpitRobotArmMetricSlots({ tagItems }: SlotsProps) {
  const matches = useMemo(() => findRobotArmTagItems(tagItems), [tagItems]);

  if (matches.length === 0) return null;

  return (
    <>
      {matches.map((it, idx) => (
        <CockpitRobotArmMetricSlot
          key={`${it.variableName ?? ""}\0${it.watchlistTagId ?? idx}`}
          item={it}
          slotIndex={idx + 1}
          totalSlots={matches.length}
        />
      ))}
    </>
  );
}

/** 一个箱子（箱体 + 一条封带），x/y 为左上角 */
function Pkg({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width="9" height="6" rx="1.1" fill="currentColor" opacity="0.92" />
      <rect x={x + 1.7} y={y + 1.3} width="5.6" height="1.6" rx="0.4" fill="#0f172a" opacity="0.35" />
    </>
  );
}

/**
 * 机械臂工位：**左右各一台摆臂机夹着一条传送带**，走完整搬运链 ——
 * 左臂摆到外侧地面抓起箱子、转回来放上传送带 → 传送带把箱子送到右边 → 右臂抓起、摆到外侧地面放下。
 *
 * 两台臂都是**绕立柱顶旋转**（取放靠摆臂，不是直上直下）。三处关键做法：
 * 1. 箱子不是「自己算一条轨迹去追爪子」，而是**挂在末端总成里**（腕→爪→箱同一个组），
 *    所以相对位置永远精确，不需要手调关键帧去凑。悬臂转多少，末端总成就反向补偿多少，
 *    箱子和爪子始终水平 —— 逐帧取负 + 同一 easing，两边才能严丝合缝抵消。
 * 2. 夹爪分合单独一套关键帧（0=合拢 / 34°=张开），抓取时合拢、放下时张开。
 * 3. 货在带上的行程占满半个周期，另有一件错开半周期，任意时刻带上都不会空一截。
 */
function CockpitRobotArmShuttleSvg({ running, className }: { running: boolean; className?: string }) {
  /* React 19 的 useId 形如 «r0»，直接塞进 url(#…) 不是合法片段标识，只留 ASCII */
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const slotClipId = `cockpitBeltSlot-${uid}`;
  /* 停机时不给动画类：各元素落回自己的基准姿态 —— 臂停在带边、爪子合拢、带上停着一件货 */
  const anim = (cls: string) => (running ? cls : undefined);

  /* 视窗贴着内容取（左右各留 ~1.4、上下 ~0.9），画面才撑得满卡片；地板/地面画到框外自然被裁齐 */
  return (
    <svg className={cn(className)} viewBox="11.5 7.5 81 31" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <clipPath id={slotClipId}>
          <rect x="31" y="30.4" width="42" height="4.5" rx="0.8" />
        </clipPath>
      </defs>

      {/* 地面 */}
      <rect x="8" y="35.6" width="88" height="2.1" rx="1" fill="currentColor" opacity="0.13" />

      {/* 传送带：实体机身 + 两端滚筒 + 凹陷带膛（膛里带纹在爬）+ 略高于带面的端墙 —— 整体是一条通道，不是一根虚线 */}
      <rect x="30" y="29" width="44" height="6.6" rx="1.4" fill="currentColor" opacity="0.16" />
      <rect x="29" y="28.2" width="1.9" height="7.4" rx="0.9" fill="currentColor" opacity="0.3" />
      <rect x="73.1" y="28.2" width="1.9" height="7.4" rx="0.9" fill="currentColor" opacity="0.3" />
      <rect x="31" y="30.4" width="42" height="4.5" rx="0.8" fill="#020617" opacity="0.32" />
      <g clipPath={`url(#${slotClipId})`}>
        <g className={anim("cockpitBeltTread")}>
          {BELT_TICKS.map((x) => (
            <line key={x} x1={x} y1="30.8" x2={x} y2="34.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
          ))}
        </g>
      </g>
      <circle cx="32.2" cy="32.6" r="2.1" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <g style={{ transformOrigin: "32.2px 32.6px" }} className={anim("cockpitRoller")}>
        <line x1="32.2" y1="32.6" x2="32.2" y2="31.2" stroke="currentColor" strokeWidth="0.95" strokeLinecap="round" opacity="0.75" />
      </g>
      <circle cx="32.2" cy="32.6" r="0.55" fill="currentColor" opacity="0.5" />
      <circle cx="71.8" cy="32.6" r="2.1" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <g style={{ transformOrigin: "71.8px 32.6px" }} className={anim("cockpitRoller")}>
        <line x1="71.8" y1="32.6" x2="71.8" y2="31.2" stroke="currentColor" strokeWidth="0.95" strokeLinecap="round" opacity="0.75" />
      </g>
      <circle cx="71.8" cy="32.6" r="0.55" fill="currentColor" opacity="0.5" />
      <line x1="30" y1="29" x2="74" y2="29" stroke="currentColor" strokeWidth="1.1" opacity="0.45" />

      {/* 左右立柱：柱身+底座固定不动，只有悬臂摆 */}
      <rect x="20.3" y="10" width="3.4" height="25.6" rx="1" fill="currentColor" opacity="0.34" />
      <rect x="17.2" y="32.3" width="9.6" height="3.3" rx="1.2" fill="currentColor" opacity="0.26" />
      <circle cx="22" cy="11" r="2.6" fill="currentColor" opacity="0.46" />
      <rect x="80.3" y="10" width="3.4" height="25.6" rx="1" fill="currentColor" opacity="0.34" />
      <rect x="77.2" y="32.3" width="9.6" height="3.3" rx="1.2" fill="currentColor" opacity="0.26" />
      <circle cx="82" cy="11" r="2.6" fill="currentColor" opacity="0.46" />

      {/* 带上的两件货：同一套关键帧、错开半个周期 */}
      <g className={anim("cockpitBeltPkg")} style={{ color: BOX_COLOR }}>
        <Pkg x={31.5} y={23} />
      </g>
      <g className={cn("cockpitPkgOff", anim("cockpitBeltPkg"), anim("cockpitPkgAlt"))} style={{ color: BOX_COLOR }}>
        <Pkg x={31.5} y={23} />
      </g>

      {/* 左取料位待取的货：臂不在时它就在那儿等着，免得箱子凭空出现 */}
      <g className={cn("cockpitPkgOff", anim("cockpitWaitLeft"))} style={{ color: BOX_COLOR }}>
        <Pkg x={12.9} y={29.6} />
      </g>

      {/* 左机械臂：悬臂绕柱顶摆；末端总成（腕+爪+手里的货）反向补偿，永远水平 */}
      <g style={{ transformOrigin: "22px 11px" }} className={anim("cockpitArmLeft")}>
        <line x1="22" y1="11" x2="36" y2="21" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" opacity="0.62" />
        <circle cx="36" cy="21" r="2" fill="currentColor" opacity="0.5" />
        <g style={{ transformOrigin: "36px 21px" }} className={anim("cockpitArmUprightL")}>
          <g className={cn("cockpitPkgOff", anim("cockpitCarryLeft"))} style={{ color: BOX_COLOR }}>
            <Pkg x={31.5} y={23} />
          </g>
          <rect x="31.1" y="20.8" width="9.8" height="2.3" rx="1" fill="currentColor" opacity="0.72" />
          <g style={{ transformOrigin: "32.3px 23.1px" }} className={anim("cockpitJawLeft")}>
            <rect x="31.6" y="23" width="1.4" height="5.8" rx="0.7" fill="currentColor" opacity="0.85" />
          </g>
          {/* 另一片爪子：镜像坐标系里同一套关键帧，自动变成反向张开 */}
          <g transform="translate(72 0) scale(-1 1)">
            <g style={{ transformOrigin: "32.3px 23.1px" }} className={anim("cockpitJawLeft")}>
              <rect x="31.6" y="23" width="1.4" height="5.8" rx="0.7" fill="currentColor" opacity="0.85" />
            </g>
          </g>
        </g>
      </g>

      {/* 右机械臂：与左臂镜像 */}
      <g style={{ transformOrigin: "82px 11px" }} className={anim("cockpitArmRight")}>
        <line x1="82" y1="11" x2="68" y2="21" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" opacity="0.62" />
        <circle cx="68" cy="21" r="2" fill="currentColor" opacity="0.5" />
        <g style={{ transformOrigin: "68px 21px" }} className={anim("cockpitArmUprightR")}>
          <g className={cn("cockpitPkgOff", anim("cockpitCarryRight"))} style={{ color: BOX_COLOR }}>
            <Pkg x={63.5} y={23} />
          </g>
          <rect x="63.1" y="20.8" width="9.8" height="2.3" rx="1" fill="currentColor" opacity="0.72" />
          <g style={{ transformOrigin: "64.3px 23.1px" }} className={anim("cockpitJawRight")}>
            <rect x="63.6" y="23" width="1.4" height="5.8" rx="0.7" fill="currentColor" opacity="0.85" />
          </g>
          <g transform="translate(136 0) scale(-1 1)">
            <g style={{ transformOrigin: "64.3px 23.1px" }} className={anim("cockpitJawRight")}>
              <rect x="63.6" y="23" width="1.4" height="5.8" rx="0.7" fill="currentColor" opacity="0.85" />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
