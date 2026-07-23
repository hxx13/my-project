import { useId, useMemo } from "react";
import { useAnimalTelemetryFxIconVariant } from "./AnimalTelemetryFxIconVariantContext";

/**
 * 天气预报式风流线：曲线路径 + stroke-dashoffset；送/排风用同卡片内**旋转虚线环**
 * 顺/逆时针区分类型，流线叠加柔光（SVG filter），与 twinChromeAnimalTelemetryRoomFx.css 配套。
 */
export function AnimalTelemetryWindStreamSvg({ variant }: { variant: "supply" | "exhaust" }) {
  const fx = useAnimalTelemetryFxIconVariant();
  const isSciFi = fx === "scifi";
  const uid = useId().replace(/:/g, "");
  const filterId = `at-wind-glow-${uid}`;

  const palette = useMemo(() => {
    if (variant === "supply") {
      return {
        /** 流线主色 + 高光（略亮于旧版，便于光晕辨认） */
        strokes: isSciFi
          ? ["rgba(125,211,252,0.72)", "rgba(56,189,248,0.55)", "rgba(165,243,252,0.62)", "rgba(14,165,233,0.5)", "rgba(125,211,252,0.68)"]
          : ["rgba(2,132,199,0.62)", "rgba(14,165,233,0.52)", "rgba(56,189,248,0.58)", "rgba(3,105,161,0.45)", "rgba(14,165,233,0.58)"],
        vortex: isSciFi ? "rgba(125,211,252,0.42)" : "rgba(14,165,233,0.38)",
        vortexDim: isSciFi ? "rgba(56,189,248,0.22)" : "rgba(56,189,248,0.2)",
        blurSigma: isSciFi ? 1.35 : 1.05,
        sw: isSciFi ? 1.25 : 1.12,
      };
    }
    return {
      strokes: isSciFi
        ? ["rgba(196,181,253,0.68)", "rgba(129,140,248,0.52)", "rgba(167,139,250,0.62)", "rgba(99,102,241,0.48)", "rgba(165,180,252,0.58)"]
        : ["rgba(99,102,241,0.55)", "rgba(139,92,246,0.42)", "rgba(129,140,248,0.52)", "rgba(79,70,229,0.4)", "rgba(124,58,237,0.48)"],
      vortex: isSciFi ? "rgba(167,139,250,0.4)" : "rgba(99,102,241,0.36)",
      vortexDim: isSciFi ? "rgba(129,140,248,0.2)" : "rgba(129,140,248,0.18)",
      blurSigma: isSciFi ? 1.25 : 0.95,
      sw: isSciFi ? 1.18 : 1.05,
    };
  }, [variant, isSciFi]);

  const supplyPaths = [
    "M -8 56 C 28 44, 58 30, 96 22 S 132 14, 148 10",
    "M -12 44 C 24 32, 54 22, 92 16 S 128 12, 152 8",
    "M -6 66 C 34 54, 68 40, 104 32 S 138 26, 156 20",
    "M -4 36 C 32 26, 64 18, 100 12 S 134 8, 150 6",
    "M 0 50 C 36 38, 72 28, 108 20 S 140 16, 158 12",
  ];
  const exhaustPaths = [
    "M -8 14 C 30 26, 62 40, 98 50 S 134 58, 150 62",
    "M -12 26 C 26 36, 58 48, 94 56 S 130 62, 154 66",
    "M -6 8 C 34 20, 68 34, 104 46 S 140 54, 158 58",
    "M -4 32 C 28 40, 60 50, 96 56 S 132 60, 148 64",
    "M 0 20 C 38 30, 74 42, 110 50 S 142 56, 160 60",
  ];
  const paths = variant === "supply" ? supplyPaths : exhaustPaths;
  const { strokes, vortex, vortexDim, blurSigma, sw } = palette;

  const vcx = 118;
  const vcy = 38;

  return (
    <svg
      className="animal-telemetry-wind-stream-svg block h-full w-full"
      viewBox="0 0 160 72"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter id={filterId} x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation={blurSigma} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 送风顺时针、排风逆时针：由父级 .animal-telemetry-wind-field--* 控制 animation-direction */}
      <g className="animal-telemetry-wind-vortex" transform={`translate(${vcx} ${vcy})`}>
        <g className="animal-telemetry-wind-vortex-spin">
          <circle cx="0" cy="0" r="22" fill="none" stroke={vortexDim} strokeWidth="1.25" strokeDasharray="10 22" strokeLinecap="round" />
          <circle cx="0" cy="0" r="16" fill="none" stroke={vortex} strokeWidth="1.35" strokeDasharray="14 26" strokeLinecap="round" />
          <circle cx="0" cy="0" r="28" fill="none" stroke={vortex} strokeWidth="1" strokeDasharray="18 44" strokeLinecap="round" opacity="0.85" />
        </g>
      </g>

      <g className="animal-telemetry-wind-streams">
        {paths.map((d, i) => {
          const dash = 14 + i * 4;
          const gap = 10 + (i % 3) * 2;
          return (
            <path
              key={i}
              className="animal-telemetry-wind-path"
              d={d}
              fill="none"
              stroke={strokes[i]}
              strokeWidth={sw}
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              filter={`url(#${filterId})`}
              style={{
                animationDuration: `${2.75 + i * 0.32}s`,
                animationDelay: `${i * 0.26}s`,
              }}
            />
          );
        })}
      </g>
    </svg>
  );
}
