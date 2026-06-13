/**
 * 夜空遮罩装饰：辉光雾 + 闪烁白点 + 发光手绘黄星 / 月亮
 * 扫码弹窗暗色、首页大屏暗色共用。
 */

const NIGHT_STAR_SKETCH =
  "M12 1.5 L14.8 9.2 L22.8 10.2 L16.2 15.8 L17.8 23.8 L12 19.2 L6.2 23.8 L7.8 15.8 L1.2 10.2 L9.2 9.2 Z";
const NIGHT_STAR_SPARKLE =
  "M12 0C12 6.6 17.4 12 24 12C17.4 12 12 17.4 12 24C12 17.4 6.6 12 0 12C6.6 12 12 6.6 12 0Z";
const NIGHT_MOON_PATH =
  "M28 8 C16 8 10 20 10 32 C10 44 18 54 28 54 C20 50 16 42 16 32 C16 18 22 10 28 8 Z";

type NightDotSpec = {
  left: string;
  top: string;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
  fine?: boolean;
  micro?: boolean;
};

function buildNightDots(count: number, seed = 0): NightDotSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + seed;
    return {
      left: `${((n * 17 + 7) % 95) + 2}%`,
      top: `${((n * 23 + 11) % 92) + 4}%`,
      size: n % 5 === 0 ? 3.5 : n % 3 === 0 ? 2.5 : n % 7 === 0 ? 1.2 : 1.5,
      delay: (n * 0.27) % 4.2,
      duration: 2.2 + (n % 6) * 0.45,
      opacity: 0.5 + (n % 4) * 0.12,
    };
  });
}

function buildFineNightDots(count: number, seed = 100): NightDotSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + seed;
    return {
      left: `${((n * 13 + 3) % 97) + 1}%`,
      top: `${((n * 19 + 9) % 94) + 3}%`,
      size: n % 4 === 0 ? 2 : 1.25,
      delay: (n * 0.19) % 3.6,
      duration: 1.4 + (n % 5) * 0.28,
      opacity: 0.42 + (n % 5) * 0.1,
      fine: true,
    };
  });
}

function buildMicroNightDots(count: number, seed = 300): NightDotSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + seed;
    return {
      left: `${((n * 11 + 5) % 98) + 0.5}%`,
      top: `${((n * 15 + 7) % 96) + 2}%`,
      size: n % 3 === 0 ? 1.1 : 0.75,
      delay: (n * 0.14) % 2.8,
      duration: 1.1 + (n % 4) * 0.22,
      opacity: 0.38 + (n % 4) * 0.08,
      fine: true,
      micro: true,
    };
  });
}

const NIGHT_DOTS = buildNightDots(72);
const NIGHT_DOTS_RICH = [
  ...buildNightDots(120, 12),
  ...buildFineNightDots(100, 200),
  ...buildFineNightDots(72, 380),
];
/** 首页大屏：高密度星尘 */
const NIGHT_DOTS_ULTRA = [
  ...buildNightDots(200, 3),
  ...buildFineNightDots(180, 160),
  ...buildFineNightDots(140, 420),
  ...buildMicroNightDots(120, 680),
];

const NIGHT_STARS = [
  { left: "10%", top: "14%", size: 38, rotate: -12, delay: 0, opacity: 0.9 },
  { left: "24%", top: "8%", size: 22, rotate: 8, delay: 0.5, opacity: 0.75 },
  { left: "68%", top: "11%", size: 32, rotate: 18, delay: 0.3, opacity: 0.85 },
  { left: "82%", top: "22%", size: 26, rotate: -6, delay: 0.8, opacity: 0.8 },
  { left: "46%", top: "18%", size: 20, rotate: -20, delay: 1.1, opacity: 0.7 },
  { left: "14%", top: "42%", size: 24, rotate: 14, delay: 0.65, opacity: 0.78 },
  { left: "58%", top: "38%", size: 18, rotate: -10, delay: 0.4, opacity: 0.72 },
  { left: "92%", top: "52%", size: 28, rotate: 6, delay: 0.95, opacity: 0.82 },
  { left: "34%", top: "62%", size: 22, rotate: -16, delay: 0.2, opacity: 0.76 },
  { left: "72%", top: "74%", size: 30, rotate: 10, delay: 0.55, opacity: 0.84 },
  { left: "6%", top: "78%", size: 20, rotate: -8, delay: 1.25, opacity: 0.7 },
  { left: "50%", top: "82%", size: 16, rotate: 22, delay: 0.75, opacity: 0.68 },
];

const NIGHT_MOONS = [
  { left: "86%", top: "16%", size: 52, rotate: -18, delay: 0 },
  { left: "4%", top: "58%", size: 36, rotate: 12, delay: 0.6 },
  { left: "62%", top: "6%", size: 28, rotate: -8, delay: 1.2 },
];

function NightSkyOrbs() {
  return (
    <div className="scan-popup-backdrop__orbs" aria-hidden>
      <div className="scan-popup-backdrop__orb scan-popup-backdrop__orb--primary" />
      <div className="scan-popup-backdrop__orb scan-popup-backdrop__orb--secondary" />
      <div className="scan-popup-backdrop__orb scan-popup-backdrop__orb--tertiary" />
      <div className="scan-popup-backdrop__orb scan-popup-backdrop__orb--ambient" />
      <div className="scan-popup-backdrop__orb scan-popup-backdrop__orb--steel" />
      <div className="scan-popup-backdrop__orb scan-popup-backdrop__orb--warm-core" />
    </div>
  );
}

function NightSkyDots({ dots }: { dots: NightDotSpec[] }) {
  return dots.map((d, i) => (
    <span
      key={`night-dot-${i}-${d.left}-${d.top}`}
      className={`scan-popup-backdrop__night-dot${
        d.micro ? " scan-popup-backdrop__night-dot--micro" : d.fine ? " scan-popup-backdrop__night-dot--fine" : ""
      }`}
      style={{
        left: d.left,
        top: d.top,
        width: d.size,
        height: d.size,
        ["--night-delay" as string]: `${d.delay}s`,
        ["--night-duration" as string]: `${d.duration}s`,
        ["--night-opacity" as string]: String(d.opacity),
      }}
    />
  ));
}

function NightSkyDoodles({ ultraRich, richStars }: { ultraRich: boolean; richStars: boolean }) {
  const dots = ultraRich ? NIGHT_DOTS_ULTRA : richStars ? NIGHT_DOTS_RICH : NIGHT_DOTS;

  return (
    <div className="scan-popup-backdrop__night" aria-hidden>
      <NightSkyDots dots={dots} />
      {NIGHT_STARS.map((s, i) => (
        <div
          key={`night-star-${i}`}
          className="scan-popup-backdrop__night-star-wrap"
          style={{
            left: s.left,
            top: s.top,
            ["--night-delay" as string]: `${s.delay}s`,
            ["--night-opacity" as string]: String(s.opacity),
            ["--night-rotate" as string]: `${s.rotate}deg`,
          }}
        >
          <svg
            className="scan-popup-backdrop__night-star-svg"
            viewBox="0 0 24 24"
            width={s.size}
            height={s.size}
            aria-hidden
          >
            <path
              d={i % 3 === 0 ? NIGHT_STAR_SPARKLE : NIGHT_STAR_SKETCH}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth={i % 3 === 0 ? 0 : 0.65}
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ))}
      {NIGHT_MOONS.map((m, i) => (
        <div
          key={`night-moon-${i}`}
          className="scan-popup-backdrop__night-moon-wrap"
          style={{
            left: m.left,
            top: m.top,
            ["--night-delay" as string]: `${m.delay}s`,
            ["--night-rotate" as string]: `${m.rotate}deg`,
          }}
        >
          <svg
            className="scan-popup-backdrop__night-moon-svg"
            viewBox="0 0 56 56"
            width={m.size}
            height={m.size}
            aria-hidden
          >
            <path
              d={NIGHT_MOON_PATH}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

export function NightSkyBackdropDecor({
  includeOrbs = true,
  richStars = false,
  ultraRich = false,
}: {
  includeOrbs?: boolean;
  /** 更多闪烁白点（Debug 等） */
  richStars?: boolean;
  /** 首页大屏：超高密度星尘 */
  ultraRich?: boolean;
}) {
  return (
    <>
      {includeOrbs ? <NightSkyOrbs /> : null}
      <NightSkyDoodles ultraRich={ultraRich} richStars={richStars} />
    </>
  );
}
