import { useCallback, useEffect, useState } from "react";
import { fetchAiDrawerCopy } from "@/api/domains/aiDrawer.api";

/** 取值签名：键 + 兜底原文（可选占位符变量）→ 最终文案。 */
export type CopyFn = (
  key: string,
  fallback: string,
  vars?: Record<string, string | number>,
) => string;

/**
 * 占位符替换（**纯函数**，便于单测）。
 *
 * 把模板里的 `{name}` / `{mm:ss}` 换成变量值。**没给对应变量的占位符原样留着** ——
 * 库里配了模板却没给值时不渲染成空洞，漏配一眼可见。
 */
export function applyCopyVars(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{([^{}]+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
  );
}

/**
 * 取一条文案（**纯函数**）：库里有该键的非空值就以库为准（过一遍占位符替换），
 * 否则返回调用点兜底原文。**兜底原文原样返回**，不再做占位符替换 —— 它本来就是拼好的成品。
 */
export function resolveCopy(
  map: Record<string, string> | null | undefined,
  key: string,
  fallback: string,
  vars?: Record<string, string | number>,
): string {
  const fromDb = map?.[key];
  if (typeof fromDb === "string" && fromDb.length > 0) {
    return applyCopyVars(fromDb, vars);
  }
  return fallback;
}

/** 文案拉取超时：超了就当拿不到，静默回落兜底（不拖住面板）。 */
const COPY_TIMEOUT_MS = 4000;
/** 进程内缓存：同一页面里只拉一次，多个面板/多张卡片共用。 */
let cache: Record<string, string> | null = null;
let inflight: Promise<Record<string, string>> | null = null;

/**
 * 拉一次并缓存。失败 / 超时静默回落空表（调用点各自用兜底原文）。
 * 成功才写缓存；失败不写，于是下一次挂载还能再试一次。
 */
function loadCopy(): Promise<Record<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), COPY_TIMEOUT_MS);
    inflight = fetchAiDrawerCopy(ctrl.signal)
      .then((m) => {
        cache = m;
        return m;
      })
      .catch(() => ({}))
      .finally(() => {
        clearTimeout(timer);
        inflight = null;
      });
  }
  return inflight;
}

/**
 * 面板挂载后拉一次抽屉文案并缓存；返回 `copy(键, 兜底原文, 变量?)`。
 *
 * <p>**不在每次渲染里请求**：模块级缓存 + 只在挂载时触发一次；接口拿不到数据时
 * 全部走各调用点的兜底原文，界面与改动前逐字相同。
 */
export function useAiDrawerCopy(): CopyFn {
  const [map, setMap] = useState<Record<string, string> | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadCopy().then((m) => {
      if (alive) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return useCallback<CopyFn>((key, fallback, vars) => resolveCopy(map, key, fallback, vars), [map]);
}
