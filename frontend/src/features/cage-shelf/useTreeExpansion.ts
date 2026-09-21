import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMiniPreferences, saveMiniPreferences, type MiniPreferences } from "@/api/domains/me.api";

/**
 * 左侧笼架树的展开状态，**存后端**（`/me/mini-preferences` 的 `cageShelfTreeExpanded`）。
 *
 * 为什么不是 localStorage：用户口径是「下次打开这个页面自动展开」，而且换设备也该记得。
 * 为什么只提交这一个字段：`mini_preferences_json` 是主题/侧栏/学生端共用的一整包，整包回写会
 * 把别人刚存的字段覆盖掉（[[mini-preferences-partial-write-contract]]），后端对 null 字段保留库内值，
 * 所以局部提交是安全的。
 *
 * 失败一律降级：读不到就用调用方给的默认展开集，写不进去就只留内存态 —— 「记不住展开」不该让页面崩。
 */
export function useTreeExpansion(prefKey: "cageShelfTreeExpanded", defaultKeys?: Iterable<string>) {
  const [exp, setExp] = useState<Set<string>>(() => new Set(defaultKeys ?? []));
  const expRef = useRef(exp);
  expRef.current = exp;
  const saveTimer = useRef<number | null>(null);

  // 拉一次已保存的展开集；拿到才覆盖默认值（默认值是「展开到哪一层更友好」的兜底，优先于空）
  useEffect(() => {
    let cancelled = false;
    fetchMiniPreferences()
      .then((p) => {
        if (cancelled || !p) return;
        const saved = p[prefKey];
        if (Array.isArray(saved)) setExp(new Set(saved.map(String)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [prefKey]);

  /** 防抖 800ms：展开是一层一层点的，别每点一下打一次请求。 */
  const persist = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const payload: Partial<MiniPreferences> = {};
      payload[prefKey] = [...expRef.current];
      void saveMiniPreferences(payload).catch(() => {});
    }, 800);
  }, [prefKey]);

  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  const toggleNode = useCallback((key: string) => {
    setExp((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    persist();
  }, [persist]);

  /** 整批展开（跳房间 / 进收藏用）：**合并**而非替换 —— 别把用户自己展开的别的分支收掉。 */
  const expandKeys = useCallback((keys: Iterable<string>) => {
    setExp((prev) => { const n = new Set(prev); for (const k of keys) n.add(k); return n; });
    persist();
  }, [persist]);

  return { exp, toggleNode, expandKeys };
}
