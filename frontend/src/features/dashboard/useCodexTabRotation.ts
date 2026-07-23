import { useCallback, useEffect, useRef, useState } from "react";

export type CodexTabId = "notice" | "violation";

/**
 * 主页 RuleCodexCard 双 Tab 轮播：滚动完成或定时兜底切换 Tab。
 */
export function useCodexTabRotation(options: {
  violationEnabled: boolean;
  hasViolations: boolean;
  /** 公告 Tab 最长停留秒数（定时兜底切换） */
  autoRotateSeconds: number;
}) {
  const { violationEnabled, hasViolations, autoRotateSeconds } = options;
  const [tab, setTab] = useState<CodexTabId>("notice");
  const [generation, setGeneration] = useState(0);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const switchTo = useCallback((next: CodexTabId) => {
    setTab((prev) => {
      if (prev === next) return prev;
      setGeneration((g) => g + 1);
      return next;
    });
  }, []);

  const toggleTab = useCallback(() => {
    if (!violationEnabled || !hasViolations) return;
    const next: CodexTabId = tabRef.current === "notice" ? "violation" : "notice";
    switchTo(next);
  }, [violationEnabled, hasViolations, switchTo]);

  const onPanelCycleComplete = useCallback(() => {
    if (!violationEnabled || !hasViolations) {
      setGeneration((g) => g + 1);
      return;
    }
    toggleTab();
  }, [violationEnabled, hasViolations, toggleTab]);

  const ensureNotice = useCallback(() => {
    if (tabRef.current !== "notice") {
      switchTo("notice");
    }
  }, [switchTo]);

  useEffect(() => {
    if (!violationEnabled || !hasViolations) return;
    const ms = Math.max(300_000, autoRotateSeconds * 1000); // ≥5min, 给 3轮×30s 留足时间
    const id = window.setInterval(() => {
      toggleTab();
    }, ms);
    return () => window.clearInterval(id);
  }, [violationEnabled, hasViolations, autoRotateSeconds, toggleTab, generation]);

  return {
    tab,
    generation,
    setTab: switchTo,
    onPanelCycleComplete,
    ensureNotice,
  };
}
