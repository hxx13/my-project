import { useEffect, useState } from "react";

type Options = {
  /** 每秒字符数 */
  cps?: number;
  /** false 时一次性展示全文 */
  enabled?: boolean;
};

/**
 * 逐字打出文案；`enabled=false` 或 `cps<=0` 时立即展示全文。
 */
export function useTypewriterText(fullText: string, options: Options = {}) {
  const { cps = 60, enabled = true } = options;
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const text = fullText.trim();
    if (!text) {
      setDisplayed("");
      setDone(false);
      return;
    }

    if (!enabled || cps <= 0) {
      setDisplayed(text);
      setDone(true);
      return;
    }

    setDisplayed("");
    setDone(false);
    let index = 0;
    let delay = Math.max(16, Math.round(1000 / cps));
    let timer = 0;
    const tick = () => {
      const remaining = text.length - index;
      /*
       * **前段逐字、到顶就成块。**
       *
       * 开头按 cps 逐字（看得出「在生成」，不是一下子糊一整块），随后每字间隔按 3% 递减 ——
       * 700 字的表格逐字打完要十几秒，人都等走了。
       *
       * **到最快（4ms 底）之后还剩一大截时，改成一块一块地出**（用户 2026-10-11 提）：
       * 那时再逐字，剩下的纯粹是让用户干等 —— 观感上「生成中」早就表达过了，没有信息量。
       * 块大小按剩余量取 10%，越到最后收得越快，收尾不会拖泥带水。
       * 下限 4ms 是浏览器定时器的实际粒度。
       */
      if (delay <= 4 && remaining > 80) {
        index = Math.min(text.length, index + Math.ceil(remaining * 0.1));
      } else {
        index += 1;
      }
      setDisplayed(text.slice(0, index));
      if (index >= text.length) {
        setDone(true);
        return;
      }
      delay = Math.max(4, delay * 0.97);
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, delay);

    return () => window.clearTimeout(timer);
  }, [fullText, enabled, cps]);

  return {
    displayed,
    done,
    isTyping: Boolean(fullText.trim()) && enabled && !done,
  };
}

/** 是否应降级为即时展示（无打字机动效） */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}
