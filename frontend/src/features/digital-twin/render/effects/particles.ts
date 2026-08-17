// 风粒子纯函数：把边上的风量（flow, m³/h）换算成粒子数量 / 速度 / 透明度。
// 这里不依赖任何 React 或 DOM，公式是精确契约，后续单测会直接断言。

/** 把数值夹到 [0, 1] 区间。 */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 风量 → 粒子数量：至少 3 个，约每 120 m³/h 一个。 */
export function particleCount(flow: number): number {
  return Math.max(3, Math.round(flow / 120));
}

/** 风量 → 粒子速度：单位是「路径长度占比 / 秒」。 */
export function particleSpeed(flow: number): number {
  return 0.06 + flow / 2400;
}

/** 风量 + 进度 t∈[0,1) → 粒子透明度：正弦包络乘以随风量递增的系数，再夹到 [0,1]。 */
export function particleOpacity(flow: number, t: number): number {
  return clamp01(Math.sin(Math.PI * t) * (0.35 + flow / 3000));
}
