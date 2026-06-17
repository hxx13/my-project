import type { RefObject } from 'react';

/** 等待 video 元素可采样（摄像头预热后 hidden/visible 切换也需重新就绪） */
export function waitForVideoPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  timeoutMs = 10000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      window.setTimeout(check, 50);
    };

    check();
  });
}
