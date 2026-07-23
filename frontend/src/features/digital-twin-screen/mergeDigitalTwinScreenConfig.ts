import type { DigitalTwinScreenConfig } from "@/features/digital-twin-screen/types";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 深度合并配置；仅对 plain object 递归，数组与标量后者覆盖 */
export function mergeDigitalTwinScreenConfig(
  base: DigitalTwinScreenConfig,
  patch: Partial<DigitalTwinScreenConfig> | undefined
): DigitalTwinScreenConfig {
  if (!patch) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(patch) as (keyof DigitalTwinScreenConfig)[]) {
    const pv = patch[key];
    const bv = base[key];
    if (pv === undefined) continue;
    if (isPlainObject(pv) && isPlainObject(bv)) {
      out[key as string] = mergePlain(bv as Record<string, unknown>, pv);
    } else {
      out[key as string] = pv;
    }
  }
  return out as DigitalTwinScreenConfig;
}

function mergePlain(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const bv = base[k];
    if (pv === undefined) continue;
    if (isPlainObject(pv) && isPlainObject(bv)) {
      out[k] = mergePlain(bv, pv);
    } else {
      out[k] = pv;
    }
  }
  return out;
}
