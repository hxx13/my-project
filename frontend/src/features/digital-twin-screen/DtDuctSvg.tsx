import { useId } from "react";
import type { DuctChannelModel } from "@/features/digital-twin-screen/types";

export function DtDuctSvg({
  width,
  height,
  channels,
  phaseStaggerSec,
}: {
  width: number;
  height: number;
  channels: DuctChannelModel[];
  phaseStaggerSec: number;
}) {
  const rid = useId().replace(/:/g, "");
  if (width <= 0 || height <= 0) return null;

  const volGradId = `dt-duct-vol-${rid}`;
  const streamGlowId = `dt-stream-glow-${rid}`;

  return (
    <svg
      className="absolute inset-0 z-[1] h-full w-full overflow-visible"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={volGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(148, 163, 184, 0.22)" />
          <stop offset="45%" stopColor="rgba(15, 23, 42, 0.92)" />
          <stop offset="100%" stopColor="rgba(2, 6, 23, 0.95)" />
        </linearGradient>
        <filter id={streamGlowId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {channels.map((ch) => (
        <path
          key={`${ch.id}-shell`}
          d={ch.shellD}
          fill={`url(#${volGradId})`}
          stroke="rgba(34, 211, 238, 0.38)"
          strokeWidth={1}
          strokeLinejoin="round"
          className="dt-duct-shell-edge"
        />
      ))}

      {channels.map((ch) => (
        <path
          key={`${ch.id}-rim`}
          d={ch.shellD}
          fill="none"
          stroke="rgba(255, 255, 255, 0.14)"
          strokeWidth={0.65}
          strokeLinejoin="round"
          className="pointer-events-none"
        />
      ))}

      {channels.map((ch) => (
        <g key={`${ch.id}-stream`}>
          <path
            d={ch.spineD}
            fill="none"
            className="dt-duct-stream-glow"
            style={{
              animationDelay: `${ch.columnIndex * phaseStaggerSec}s`,
            }}
          />
          <path
            d={ch.spineD}
            fill="none"
            className="dt-duct-stream-core"
            filter={`url(#${streamGlowId})`}
            style={{
              animationDelay: `${ch.columnIndex * phaseStaggerSec}s`,
            }}
          />
        </g>
      ))}
    </svg>
  );
}
