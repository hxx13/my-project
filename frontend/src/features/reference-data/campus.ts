export const ANIMAL_ORDER_CAMPUSES = ["浦东", "浦西"] as const;
export type AnimalOrderCampus = (typeof ANIMAL_ORDER_CAMPUSES)[number];

const STORAGE_KEY = "animal_order_campus";

function isCampus(v: string | null): v is AnimalOrderCampus {
  return v != null && (ANIMAL_ORDER_CAMPUSES as readonly string[]).includes(v);
}

/** 记住上次进入的校区；未选过返回 null，由页面强制弹窗选择。 */
export function readStoredCampus(): AnimalOrderCampus | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isCampus(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeCampus(campus: AnimalOrderCampus): void {
  try {
    localStorage.setItem(STORAGE_KEY, campus);
  } catch {
    /* ignore */
  }
}
