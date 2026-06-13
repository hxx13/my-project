/**
 * 扫码弹窗遮罩装饰：亮色手绘涂鸦 / 暗色夜空（与首页大屏暗色共用 NightSkyBackdropDecor）
 */
import { useTheme } from "@/features/theme/ThemeProvider";
import { NightSkyBackdropDecor } from "@/features/night-sky/NightSkyBackdropDecor";

type DoodleKind =
  | "star"
  | "sparkle"
  | "swirl"
  | "squiggle"
  | "ring"
  | "dot"
  | "heart"
  | "zigzag"
  | "arrow"
  | "cross"
  | "loop"
  | "diamond"
  | "chevron"
  | "plus";

type DoodleSpec = {
  kind: DoodleKind;
  left: string;
  top: string;
  size: number;
  rotate?: number;
  delay?: number;
  opacity?: number;
  driftX?: number;
  driftY?: number;
};

const DOODLE_PATHS = {
  star: "M12 2L15 9L22 10L17 15L18.5 22L12 18.5L5.5 22L7 15L2 10L9 9L12 2Z",
  sparkle:
    "M12 0C12 6.6 17.4 12 24 12C17.4 12 12 17.4 12 24C12 17.4 6.6 12 0 12C6.6 12 12 6.6 12 0Z",
  swirl:
    "M50 10C27.9 10 10 27.9 10 50C10 72.1 27.9 90 50 90C72.1 90 90 72.1 90 50C90 32.3 75.7 18 58 18C44.3 18 33 29.3 33 43C33 53.5 41.5 62 52 62C59.7 62 66 55.7 66 48",
  squiggle: "M4 30 C20 6, 38 44, 54 28 S 86 10, 96 26",
  squiggle2: "M6 18 C22 38, 42 4, 58 22 S 88 36, 94 14",
  heart:
    "M12 20.5 C9 17.5 3 13 3 8.5 C3 5.5 5.5 3.5 8 3.5 C9.5 3.5 11 4.5 12 5.5 C13 4.5 14.5 3.5 16 3.5 C18.5 3.5 21 5.5 21 8.5 C21 13 15 17.5 12 20.5 Z",
  zigzag: "M2 18 L8 8 L14 16 L20 6 L26 14",
  arrow: "M4 12 H18 M18 12 L12 6 M18 12 L12 18",
  loop: "M28 50 C28 28 48 28 48 50 C48 66 36 66 36 50 C36 38 44 38 44 50",
  diamond: "M12 2 L21 12 L12 22 L3 12 Z",
  chevron: "M6 9 L12 15 L18 9",
  plus: "M12 4 V20 M4 12 H20",
} as const;

const BASE_DOODLES: DoodleSpec[] = [
  { kind: "star", left: "5%", top: "9%", size: 44, rotate: -14, delay: 0, opacity: 0.7, driftX: 14, driftY: -16 },
  { kind: "sparkle", left: "93%", top: "11%", size: 32, rotate: 10, delay: 0.5, opacity: 0.66, driftX: -12, driftY: -14 },
  { kind: "swirl", left: "86%", top: "70%", size: 58, rotate: 6, delay: 1, opacity: 0.52, driftX: -10, driftY: -18 },
  { kind: "star", left: "9%", top: "78%", size: 28, rotate: 22, delay: 0.3, opacity: 0.58, driftX: 11, driftY: -12 },
  { kind: "sparkle", left: "47%", top: "5%", size: 26, rotate: -8, delay: 0.85, opacity: 0.56, driftX: 8, driftY: -15 },
  { kind: "squiggle", left: "36%", top: "90%", size: 84, rotate: -4, delay: 0.15, opacity: 0.48, driftX: 16, driftY: -10 },
  { kind: "ring", left: "3%", top: "42%", size: 48, rotate: -18, delay: 0.4, opacity: 0.4, driftX: 10, driftY: -14 },
  { kind: "ring", left: "94%", top: "36%", size: 38, rotate: 12, delay: 0.7, opacity: 0.36, driftX: -14, driftY: -12 },
  { kind: "heart", left: "74%", top: "7%", size: 24, rotate: -6, delay: 1.2, opacity: 0.55, driftX: -9, driftY: -16 },
  { kind: "zigzag", left: "18%", top: "24%", size: 52, rotate: -8, delay: 0.55, opacity: 0.5, driftX: 12, driftY: -14 },
  { kind: "arrow", left: "62%", top: "18%", size: 36, rotate: 12, delay: 0.95, opacity: 0.52, driftX: -11, driftY: -13 },
  { kind: "cross", left: "28%", top: "64%", size: 28, rotate: 0, delay: 0.25, opacity: 0.48, driftX: 9, driftY: -15 },
  { kind: "loop", left: "80%", top: "24%", size: 44, rotate: 4, delay: 0.65, opacity: 0.46, driftX: -13, driftY: -11 },
  { kind: "diamond", left: "52%", top: "48%", size: 22, rotate: 18, delay: 1.1, opacity: 0.5, driftX: 7, driftY: -17 },
  { kind: "chevron", left: "42%", top: "14%", size: 30, rotate: -20, delay: 0.35, opacity: 0.48, driftX: 10, driftY: -12 },
  { kind: "plus", left: "68%", top: "82%", size: 26, rotate: 8, delay: 0.8, opacity: 0.5, driftX: -8, driftY: -14 },
  { kind: "squiggle", left: "76%", top: "52%", size: 68, rotate: 16, delay: 0.45, opacity: 0.42, driftX: -15, driftY: -10 },
  { kind: "star", left: "56%", top: "76%", size: 20, rotate: -10, delay: 1.35, opacity: 0.52, driftX: 6, driftY: -16 },
  { kind: "sparkle", left: "12%", top: "52%", size: 24, rotate: 14, delay: 0.6, opacity: 0.5, driftX: 13, driftY: -11 },
  { kind: "heart", left: "88%", top: "48%", size: 20, rotate: 10, delay: 0.9, opacity: 0.48, driftX: -10, driftY: -15 },
  { kind: "zigzag", left: "50%", top: "32%", size: 46, rotate: 6, delay: 0.2, opacity: 0.44, driftX: -12, driftY: -13 },
  { kind: "arrow", left: "8%", top: "18%", size: 32, rotate: -16, delay: 1.05, opacity: 0.46, driftX: 14, driftY: -12 },
  { kind: "diamond", left: "24%", top: "88%", size: 18, rotate: -22, delay: 0.5, opacity: 0.46, driftX: 8, driftY: -14 },
  { kind: "chevron", left: "92%", top: "86%", size: 28, rotate: 90, delay: 0.75, opacity: 0.44, driftX: -9, driftY: -10 },
  { kind: "plus", left: "38%", top: "58%", size: 22, rotate: -4, delay: 1.15, opacity: 0.45, driftX: 11, driftY: -16 },
  { kind: "loop", left: "14%", top: "36%", size: 40, rotate: -12, delay: 0.38, opacity: 0.42, driftX: 12, driftY: -9 },
  { kind: "cross", left: "70%", top: "38%", size: 24, rotate: 45, delay: 0.88, opacity: 0.44, driftX: -7, driftY: -15 },
  { kind: "ring", left: "48%", top: "68%", size: 34, rotate: 24, delay: 0.28, opacity: 0.34, driftX: -10, driftY: -13 },
  { kind: "dot", left: "15%", top: "26%", size: 6, opacity: 0.68, driftX: 10, driftY: -12 },
  { kind: "dot", left: "56%", top: "70%", size: 5, opacity: 0.62, driftX: -8, driftY: -14 },
  { kind: "dot", left: "64%", top: "50%", size: 4, opacity: 0.55, driftX: 9, driftY: -11 },
  { kind: "dot", left: "32%", top: "40%", size: 5, opacity: 0.5, driftX: -11, driftY: -15 },
  { kind: "dot", left: "86%", top: "80%", size: 6, opacity: 0.58, driftX: -6, driftY: -13 },
  { kind: "dot", left: "46%", top: "24%", size: 4, opacity: 0.52, driftX: 7, driftY: -10 },
  { kind: "dot", left: "78%", top: "64%", size: 5, opacity: 0.54, driftX: -12, driftY: -12 },
  { kind: "dot", left: "22%", top: "72%", size: 4, opacity: 0.48, driftX: 10, driftY: -14 },
  { kind: "dot", left: "60%", top: "10%", size: 5, opacity: 0.5, driftX: -9, driftY: -16 },
  { kind: "dot", left: "4%", top: "62%", size: 5, opacity: 0.46, driftX: 13, driftY: -11 },
  { kind: "dot", left: "96%", top: "28%", size: 4, opacity: 0.5, driftX: -14, driftY: -10 },
];

const EXTRA_KINDS: DoodleKind[] = [
  "star",
  "sparkle",
  "heart",
  "diamond",
  "chevron",
  "plus",
  "dot",
  "zigzag",
  "arrow",
  "cross",
];

const EXTRA_DOODLES: DoodleSpec[] = EXTRA_KINDS.flatMap((kind, i) => {
  const n = i + BASE_DOODLES.length;
  return {
    kind,
    left: `${((n * 19 + 9) % 92) + 4}%`,
    top: `${((n * 27 + 11) % 88) + 6}%`,
    size: kind === "dot" ? 4 + (i % 3) : 18 + (i % 4) * 6,
    rotate: (n * 13) % 40 - 20,
    delay: (n * 0.17) % 1.4,
    opacity: 0.4 + (i % 5) * 0.06,
    driftX: 8 + (i % 4) * 3,
    driftY: -(10 + (i % 5) * 2),
  };
});

const DOODLES = [...BASE_DOODLES, ...EXTRA_DOODLES];

type ShapeKind = Exclude<DoodleKind, "ring" | "dot">;

function DoodleShape({ kind, size }: { kind: ShapeKind; size: number }) {
  if (kind === "squiggle") {
    return (
      <svg
        className="scan-popup-backdrop__doodle-svg"
        viewBox="0 0 100 32"
        width={size}
        height={size * 0.32}
        aria-hidden
      >
        <path
          d={DOODLE_PATHS.squiggle}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={DOODLE_PATHS.squiggle2}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.65"
        />
      </svg>
    );
  }

  if (kind === "zigzag") {
    return (
      <svg
        className="scan-popup-backdrop__doodle-svg"
        viewBox="0 0 28 20"
        width={size}
        height={size * 0.42}
        aria-hidden
      >
        <path
          d={DOODLE_PATHS.zigzag}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "loop") {
    return (
      <svg
        className="scan-popup-backdrop__doodle-svg"
        viewBox="0 0 56 56"
        width={size}
        height={size}
        aria-hidden
      >
        <path
          d={DOODLE_PATHS.loop}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const strokeKinds: ShapeKind[] = ["arrow", "cross", "chevron", "plus"];
  const viewBox = kind === "swirl" ? "0 0 100 100" : "0 0 24 24";
  const path =
    kind === "star"
      ? DOODLE_PATHS.star
      : kind === "sparkle"
        ? DOODLE_PATHS.sparkle
        : kind === "swirl"
          ? DOODLE_PATHS.swirl
          : kind === "heart"
            ? DOODLE_PATHS.heart
            : kind === "arrow"
              ? DOODLE_PATHS.arrow
              : kind === "cross"
                ? DOODLE_PATHS.plus
                : kind === "diamond"
                  ? DOODLE_PATHS.diamond
                  : kind === "chevron"
                    ? DOODLE_PATHS.chevron
                    : DOODLE_PATHS.plus;

  const strokeOnly = kind === "swirl" || strokeKinds.includes(kind);
  const strokeWidth =
    kind === "swirl" ? 5 : kind === "arrow" || kind === "chevron" ? 2.5 : 2.2;

  return (
    <svg
      className="scan-popup-backdrop__doodle-svg"
      viewBox={viewBox}
      width={size}
      height={size}
      aria-hidden
    >
      <path
        d={path}
        fill={strokeOnly ? "none" : "currentColor"}
        stroke={strokeOnly ? "currentColor" : "none"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DayBackdropDoodles() {
  return (
    <div className="scan-popup-backdrop__doodles" aria-hidden>
      {DOODLES.map((d, i) => (
        <div
          key={i}
          className={`scan-popup-backdrop__doodle scan-popup-backdrop__doodle--${d.kind}`}
          style={{
            left: d.left,
            top: d.top,
            ["--doodle-delay" as string]: `${d.delay ?? 0}s`,
            ["--doodle-opacity" as string]: String(d.opacity ?? 0.6),
            ["--doodle-rotate" as string]: `${d.rotate ?? 0}deg`,
            ["--doodle-dx" as string]: `${d.driftX ?? 12}px`,
            ["--doodle-dy" as string]: `${d.driftY ?? -14}px`,
          }}
        >
          {d.kind === "ring" ? (
            <span
              className="scan-popup-backdrop__doodle-ring"
              style={{ width: d.size, height: d.size }}
            />
          ) : d.kind === "dot" ? (
            <span
              className="scan-popup-backdrop__doodle-dot"
              style={{ width: d.size, height: d.size }}
            />
          ) : (
            <DoodleShape kind={d.kind} size={d.size} />
          )}
        </div>
      ))}
    </div>
  );
}

export function ScanPopupBackdropDecor() {
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";

  return isDark ? <NightSkyBackdropDecor /> : <DayBackdropDoodles />;
}
