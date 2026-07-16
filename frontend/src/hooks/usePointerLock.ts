import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 鼠标指针锁定 Hook — 方案2：Pointer Lock API
 *
 * 配合全屏使用，锁定鼠标光标后可大幅减少用户移动鼠标到屏幕顶部
 * 触发 shy UI 的概率。主要用于需要沉浸式操作的全屏页面。
 *
 * 使用方式：
 *   const { isLocked, requestPointerLock, exitPointerLock, targetRef } = usePointerLock();
 *   <canvas ref={targetRef} />
 *   <button onClick={requestPointerLock}>锁定鼠标</button>
 *
 * 注意：
 * - Pointer Lock 需要用户手势触发（click/keydown），不能自动调用
 * - Esc 键会同时退出 Pointer Lock 和 Fullscreen
 * - 长按 Esc（~2s）是浏览器的强制逃生通道，无法拦截
 */

export interface PointerLockState {
  isLocked: boolean;
  /** 锁定元素（null = 未锁定） */
  activeElement: Element | null;
}

export function usePointerLock() {
  const targetRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<PointerLockState>({
    isLocked: false,
    activeElement: null,
  });

  // ── 同步锁定状态 ──
  const syncState = useCallback(() => {
    const el = document.pointerLockElement;
    setState({
      isLocked: !!el,
      activeElement: el,
    });
  }, []);

  // ── 请求锁定 ──
  const requestPointerLock = useCallback(() => {
    const el = targetRef.current;
    if (!el) {
      console.warn('[usePointerLock] targetRef 未绑定元素');
      return;
    }
    el.requestPointerLock();
  }, []);

  // ── 退出锁定 ──
  const exitPointerLock = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  // ── 切换锁定 ──
  const togglePointerLock = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    } else {
      requestPointerLock();
    }
  }, [requestPointerLock]);

  // ── 全屏丢失时自动重新请求锁定（配合全屏使用）──
  const [autoRelock, setAutoRelock] = useState(false);

  useEffect(() => {
    if (!autoRelock) return;

    const onPointerLockChange = () => {
      syncState();
    };

    const onFullscreenChange = () => {
      if (document.fullscreenElement && !document.pointerLockElement) {
        // 全屏恢复但锁定丢失 → 尝试重新锁定
        const el = targetRef.current;
        if (el) {
          el.requestPointerLock();
        }
      }
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [autoRelock, syncState]);

  // ── 基础事件监听 ──
  useEffect(() => {
    syncState();
    document.addEventListener('pointerlockchange', syncState);
    return () => document.removeEventListener('pointerlockchange', syncState);
  }, [syncState]);

  return {
    ...state,
    targetRef,
    requestPointerLock,
    exitPointerLock,
    togglePointerLock,
    /** 开启后，全屏恢复时自动重新锁定鼠标 */
    setAutoRelock,
  };
}
