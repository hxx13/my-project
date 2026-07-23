/** 从 video 元素抓拍 JPEG 帧（路线 B 上传服务端比对） */
export function captureVideoFrame(
  video: HTMLVideoElement,
  quality = 0.85,
): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) {
    return Promise.reject(new Error('视频尺寸无效'));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 不可用'));
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('帧编码失败'))),
      'image/jpeg',
      quality,
    );
  });
}

/** 间隔抓拍两帧，供服务端取最优相似度 */
export async function captureVideoFramePair(
  video: HTMLVideoElement,
  gapMs = 120,
): Promise<Blob[]> {
  const first = await captureVideoFrame(video);
  if (gapMs > 0) {
    await new Promise((r) => setTimeout(r, gapMs));
  }
  const second = await captureVideoFrame(video);
  return [first, second];
}
