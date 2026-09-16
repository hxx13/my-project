/**
 * 房间「铭牌」卡 —— 白卡 + 内嵌描边 + 等宽房号 + 字母距放开的底部铭牌。
 * 交互照搬 uiverse 那套：悬停时内框从 rotate(10deg)/透明 摆正到 inset 描边，外加一道扫光。
 * 配色不用原版的深板描金（跟手机壳的暖白底 + 琥珀主色冲突），改用壳层自己的语义色：
 * 可进入=绿、待激活=琥珀、被拦=红、无权限=灰（对应 --student-accent-* / --student-*）。
 * 纯展示组件；小程序侧是同一套视觉的 wxss 静态版（无 hover）。
 */
import type { CSSProperties, ReactNode } from "react";
import styled, { keyframes } from "styled-components";

export type RoomPlateTone = "allowed" | "pending" | "blocked" | "none";

const TONE_COLOR: Record<RoomPlateTone, string> = {
  allowed: "#b08d57",
  pending: "#d97706",
  blocked: "#b3543a",
  none: "#94a3b8",
};

const trailSweep = keyframes`
  0%   { background: linear-gradient(90deg, rgba(176,141,87,0) 90%, rgba(176,141,87,.85) 100%); opacity: 0; }
  30%  { background: linear-gradient(90deg, rgba(176,141,87,0) 70%, rgba(176,141,87,.85) 100%); opacity: 1; }
  70%  { background: linear-gradient(90deg, rgba(176,141,87,0) 70%, rgba(176,141,87,.85) 100%); opacity: 1; }
  95%  { background: linear-gradient(90deg, rgba(176,141,87,0) 90%, rgba(176,141,87,.85) 100%); opacity: 0; }
`;

const CardRoot = styled.button<{ $tone: RoomPlateTone; $locked: boolean }>`
  position: relative;
  width: 100%;
  height: 96px;
  padding: 12px 10px;
  background: ${({ $locked }) => ($locked ? "#f6f7f9" : "var(--student-surface, #ffffff)")};
  border: 1px solid ${({ $locked }) => ($locked ? "rgba(15,23,42,0.05)" : "var(--student-hairline, #f0e4d0)")};
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font: inherit;
  text-align: center;
  box-shadow: ${({ $locked }) => ($locked ? "none" : "0 2px 8px rgba(20,40,70,0.05)")};
  cursor: ${({ $locked }) => ($locked ? "not-allowed" : "pointer")};
  transition: box-shadow 0.25s ease-in-out;

  /* 内嵌圆角描边：常驻，收在卡片内侧，不越出容器 */
  & > .plate-frame {
    position: absolute;
    inset: 6px;
    border: 1px solid ${({ $tone }) => TONE_COLOR[$tone]};
    border-radius: 6px;
    opacity: ${({ $tone }) => ($tone === "none" ? 0.35 : 0.85)};
    pointer-events: none;
    transition: opacity 0.25s ease-in-out;
  }

  & > .plate-trail {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }

  &:hover,
  &:focus-visible {
    box-shadow: 0 6px 18px rgba(20, 40, 70, 0.12);
  }

  &:hover > .plate-frame,
  &:focus-visible > .plate-frame {
    opacity: 1;
  }

  &:hover > .plate-trail,
  &:focus-visible > .plate-trail {
    animation: ${trailSweep} 1s ease-in-out;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    &:hover > .plate-trail,
    &:focus-visible > .plate-trail {
      animation: none;
    }
  }
`;

const Code = styled.span<{ $tone: RoomPlateTone; $locked: boolean }>`
  display: block;
  color: ${({ $locked, $tone }) =>
    $locked ? "var(--student-mute, #94a3b8)" : "var(--student-ink, #1e293b)"};
  font-family: "SF Mono", Menlo, Consolas, "Courier New", monospace;
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1.1;
`;

const Dots = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  & > i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: block;
  }
`;

/** 房内有人的呼吸点：跟状态描边同色 */
const LiveDot = styled.span<{ $tone: RoomPlateTone }>`
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $tone }) => TONE_COLOR[$tone]};
  animation: plate-breath 2s ease-in-out infinite;

  @keyframes plate-breath {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.75); }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/** 底部铭牌：卡内正常流的一行（不脱离文档流、不压描边），靠字距做出「铭牌」感 */
const PlateLabel = styled.span<{ $tone: RoomPlateTone }>`
  display: block;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 3px;
  /* letter-spacing 会在末尾留一个字距，居中时字形偏左，用等量 text-indent 顶回来 */
  text-indent: 3px;
  white-space: nowrap;
  color: ${({ $tone }) => TONE_COLOR[$tone]};
  opacity: 0.8;
  transition: opacity 0.25s ease-in-out;

  ${CardRoot}:hover &,
  ${CardRoot}:focus-visible & {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export interface RoomPlateDot {
  used: boolean;
  color: string;
}

export interface RoomPlateCardProps {
  /** 房号（等宽字） */
  code: string;
  /** 底部铭牌文字：可进入 / 待激活 / 无权限 / 已满 */
  label?: string;
  tone?: RoomPlateTone;
  dots?: RoomPlateDot[];
  /** 房内有人 → 右上角呼吸点 */
  hasPeople?: boolean;
  /** 无权限 → 灰化且不可点 */
  locked?: boolean;
  /** 房号字号（由调用方按名字长度自适应） */
  codeSize?: number;
  codeScale?: number;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export default function RoomPlateCard({
  code,
  label,
  tone = "allowed",
  dots = [],
  hasPeople = false,
  locked = false,
  codeSize,
  codeScale,
  onClick,
  className,
  style,
}: RoomPlateCardProps) {
  return (
    <CardRoot
      type="button"
      $tone={tone}
      $locked={locked}
      className={className}
      style={style}
      onClick={locked ? undefined : onClick}
      disabled={locked}
      aria-disabled={locked}
      title={label ? `${code} · ${label}` : code}
    >
      <span className="plate-frame" aria-hidden />
      <span className="plate-trail" aria-hidden />
      {hasPeople && !locked && <LiveDot $tone={tone} aria-hidden />}
      <Code
        $tone={tone}
        $locked={locked}
        style={
          codeSize
            ? { fontSize: codeSize, transform: `scale(${codeScale ?? 1})`, transformOrigin: "center center" }
            : undefined
        }
      >
        {code}
      </Code>
      {dots.length > 0 && (
        <Dots>
          {dots.map((dot, i) => (
            <i key={i} style={{ background: dot.used ? dot.color : "rgba(15,23,42,0.10)" }} />
          ))}
        </Dots>
      )}
      {label && <PlateLabel $tone={tone}>{label}</PlateLabel>}
    </CardRoot>
  );
}
