import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 浏览器全屏 Hook — 方案1：navigationUI: "hide"
 *
 * 使用方式：
 *   const { isFullscreen, requestFullscreen, exitFullscreen, targetRef } = useBrowserFullscreen();
 *   <div ref={targetRef}>全屏内容</div>
 *   <button onClick={requestFullscreen}>进入全屏</button>
 *
 * navigationUI: "hide" 会告知浏览器尽量隐藏导航 UI（地址栏/标签栏），
 * 减少鼠标触顶时 shy UI 弹出的概率。Edge/Chrome 桌面版部分支持。
 */

// 扩展 FullscreenOptions 类型，navigationUI 不在标准 TS 类型中
interface ExtendedFullscreenOptions extends FullscreenOptions {
  navigationUI?: 'auto' | 'show' | 'hide';
}

export interface BrowserFullscreenState {
  isFullscreen: boolean;
  /** 触发全屏的元素（null = 尚未进入过全屏） */
  activeElement: Element | null;
}

export function useBrowserFullscreen() {
  const targetRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<BrowserFullscreenState>({
    isFullscreen: false,
    activeElement: null,
  });

  // ── 同步全屏状态变更 ──
  const syncState = useCallback(() => {
    const el = document.fullscreenElement;
    setState({
      isFullscreen: !!el,
      activeElement: el,
    });
  }, []);

  // ── 进入全屏（带 navigationUI: "hide"）──
  const requestFullscreen = useCallback(async () => {
    const el = targetRef.current;
    if (!el) {
      console.warn('[useBrowserFullscreen] targetRef 未绑定元素，尝试用 document.documentElement');
    }
    const target = el || document.documentElement;

    try {
      // navigationUI 在标准类型定义中不存在，但 Chromium 系浏览器支持
      await target.requestFullscreen({
        navigationUI: 'hide',
      } as ExtendedFullscreenOptions);
    } catch {
      // 降级：不支持 navigationUI 的浏览器走标准全屏
      await target.requestFullscreen();
    }
  }, []);

  // ── 退出全屏 ──
  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  }, []);

  // ── 切换全屏 ──
  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await exitFullscreen();
    } else {
      await requestFullscreen();
    }
  }, [requestFullscreen, exitFullscreen]);

  // ── 监听浏览器全屏事件（F11 / Esc / 浏览器 UI 退出）──
  useEffect(() => {
    syncState();
    document.addEventListener('fullscreenchange', syncState);
    return () => document.removeEventListener('fullscreenchange', syncState);
  }, [syncState]);

  return {
    ...state,
    targetRef,
    requestFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
