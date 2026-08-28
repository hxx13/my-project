import { useId } from "react";
import "./scanAssistantPegtopLoader.css";

const PEGTOP_PATH =
  "M63,37c-6.7-4-4-27-13-27s-6.3,23-13,27-27,4-27,13,20.3,9,27,13,4,27,13,27,6.3-23,13-27,27-4,27-13-20.3-9-27-13Z";

type PegtopSvgProps = {
  idPrefix: string;
  className: string;
};

function PegtopSvg({ idPrefix, className }: PegtopSvgProps) {
  const shineId = `${idPrefix}-shine`;
  const maskId = `${idPrefix}-mask`;
  const gradient1Id = `${idPrefix}-g1`;
  const gradient2Id = `${idPrefix}-g2`;
  const gradient3Id = `${idPrefix}-g3`;
  const gradient4Id = `${idPrefix}-g4`;
  const gradient5Id = `${idPrefix}-g5`;

  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox="0 0 100 100"
      aria-hidden
    >
      <defs>
        <filter id={shineId}>
          <feGaussianBlur stdDeviation={3} />
        </filter>
        <mask id={maskId}>
          <path d={PEGTOP_PATH} fill="white" />
        </mask>
        <radialGradient
          id={gradient1Id}
          cx={50}
          cy={66}
          fx={50}
          fy={66}
          r={30}
          gradientTransform="translate(0 35) scale(1 0.5)"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="black" stopOpacity="0.3" />
          <stop offset="50%" stopColor="black" stopOpacity="0.1" />
          <stop offset="100%" stopColor="black" stopOpacity={0} />
        </radialGradient>
        <radialGradient
          id={gradient2Id}
          cx={55}
          cy={20}
          fx={55}
          fy={20}
          r={30}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="50%" stopColor="white" stopOpacity="0.1" />
          <stop offset="100%" stopColor="white" stopOpacity={0} />
        </radialGradient>
        <radialGradient
          id={gradient3Id}
          cx={85}
          cy={50}
          fx={85}
          fy={50}
          xlinkHref={`#${gradient2Id}`}
        />
        <radialGradient
          id={gradient4Id}
          cx={50}
          cy={58}
          fx={50}
          fy={58}
          r={60}
          gradientTransform="translate(0 47) scale(1 0.2)"
          xlinkHref={`#${gradient3Id}`}
        />
        <linearGradient id={gradient5Id} x1={50} y1={90} x2={50} y2={10} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="black" stopOpacity="0.2" />
          <stop offset="40%" stopColor="black" stopOpacity={0} />
        </linearGradient>
      </defs>
      <g>
        <path d={PEGTOP_PATH} fill="currentColor" />
        <path d={PEGTOP_PATH} fill={`url(#${gradient1Id})`} />
        <path
          d={PEGTOP_PATH}
          fill="none"
          stroke="white"
          opacity="0.3"
          strokeWidth={3}
          filter={`url(#${shineId})`}
          mask={`url(#${maskId})`}
        />
        <path d={PEGTOP_PATH} fill={`url(#${gradient2Id})`} />
        <path d={PEGTOP_PATH} fill={`url(#${gradient3Id})`} />
        <path d={PEGTOP_PATH} fill={`url(#${gradient4Id})`} />
        <path d={PEGTOP_PATH} fill={`url(#${gradient5Id})`} />
      </g>
    </svg>
  );
}

export type ScanAssistantPegtopLoaderProps = {
  className?: string;
  /** false 时只显示一枚静止陀螺，留在正文行首 */
  animated?: boolean;
  /** 待机态：单枚陀螺持续轻柔浮动（提问面板行首图标） */
  idle?: boolean;
};

/**
 * 三枚陀螺花瓣加载动画 — 用于扫描助手气泡「生成中 / 逐字输出」状态。
 * SVG filter/mask/gradient id 使用 useId 避免多实例冲突。
 */
export function ScanAssistantPegtopLoader({
  className = "",
  animated = true,
  idle = false,
}: ScanAssistantPegtopLoaderProps) {
  const baseId = useId().replace(/:/g, "");

  return (
    <div
      className={[
        "scan-assistant-pegtop-loader",
        animated ? "" : "scan-assistant-pegtop-loader--static",
        idle ? "scan-assistant-pegtop-loader--idle" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <PegtopSvg
        idPrefix={`${baseId}-one`}
        className="scan-assistant-pegtop-loader__pegtop scan-assistant-pegtop-loader__pegtop--one"
      />
      <PegtopSvg
        idPrefix={`${baseId}-two`}
        className="scan-assistant-pegtop-loader__pegtop scan-assistant-pegtop-loader__pegtop--two"
      />
      <PegtopSvg
        idPrefix={`${baseId}-three`}
        className="scan-assistant-pegtop-loader__pegtop scan-assistant-pegtop-loader__pegtop--three"
      />
    </div>
  );
}
