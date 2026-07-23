import * as faceapi from 'face-api.js';
import {
  ENROLL_MAX_PHOTOS,
  ENROLL_MIN_PHOTOS,
  ENROLL_OPEN_EYE_EAR_MIN,
  ENROLL_PAIRWISE_MIN_SIM,
  ENROLL_FRONTAL_NOSE_OFFSET_MAX,
  ENROLL_MIN_BLUR_VARIANCE,
  ENROLL_MIN_DETECTION_SCORE,
  ENROLL_MIN_FACE_WIDTH_RATIO,
} from './faceConfig';
import {
  DEFAULT_FACE_ENROLL_STRICT,
  formatStrictEnrollmentFailReason,
  type FaceEnrollStrictThresholds,
} from './faceEnrollStrictConfig';

export interface EnrollFrameMetrics {
  frontal: boolean;
  eyesOpen: boolean;
  sharp: boolean;
  unobstructed: boolean;
  detectionScore: number;
  blurVariance: number;
  ear: number;
  noseOffset: number;
  faceWidthRatio: number;
}

export interface EnrollCandidate {
  file: File;
  descriptor: Float32Array;
  metrics: EnrollFrameMetrics;
  qualityScore: number;
}

export interface EnrollQcResult {
  selected: EnrollCandidate[];
  rejectedCount: number;
  reason?: string;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(eye: faceapi.Point[]): number {
  if (eye.length < 6) return 0;
  const vertical = dist(eye[1], eye[5]) + dist(eye[2], eye[4]);
  const horizontal = dist(eye[0], eye[3]);
  return horizontal > 0 ? vertical / (2 * horizontal) : 0;
}

function descriptorSimilarity(a: Float32Array, b: Float32Array): number {
  const d = faceapi.euclideanDistance(a, b);
  return Math.max(0, Math.min(1, 1 - d / 2));
}

function loadFileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

/** Laplacian 方差：越大越清晰 */
function computeBlurVariance(
  canvas: HTMLCanvasElement,
  box: faceapi.Box,
): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(canvas.width - x, Math.floor(box.width));
  const h = Math.min(canvas.height - y, Math.floor(box.height));
  if (w < 8 || h < 8) return 0;

  const { data, width, height } = ctx.getImageData(x, y, w, h);
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const idx = row * width + col;
      const lap =
        gray[idx - width] + gray[idx - 1] + gray[idx + 1] + gray[idx + width] - 4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function isLandmarksUnobstructed(
  det: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>,
  imageW: number,
  imageH: number,
): boolean {
  const margin = Math.min(imageW, imageH) * 0.02;
  const points = det.landmarks.positions;
  for (const p of points) {
    if (p.x < margin || p.y < margin || p.x > imageW - margin || p.y > imageH - margin) {
      return false;
    }
  }
  const lm = det.landmarks;
  const leftEar = eyeAspectRatio(lm.getLeftEye());
  const rightEar = eyeAspectRatio(lm.getRightEye());
  if (leftEar < ENROLL_OPEN_EYE_EAR_MIN * 0.85 || rightEar < ENROLL_OPEN_EYE_EAR_MIN * 0.85) {
    return false;
  }
  return true;
}

function assessFrame(
  det: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>,
  blurVariance: number,
  imageW: number,
  imageH: number,
): EnrollFrameMetrics {
  const lm = det.landmarks;
  const noseTip = lm.getNose()[3];
  const jawLeft = lm.getJawOutline()[0];
  const jawRight = lm.getJawOutline()[16];
  const faceCenter = (jawLeft.x + jawRight.x) / 2;
  const faceWidth = jawRight.x - jawLeft.x;
  const noseOffset = faceWidth > 0 ? Math.abs((noseTip.x - faceCenter) / faceWidth) : 1;
  const ear = (eyeAspectRatio(lm.getLeftEye()) + eyeAspectRatio(lm.getRightEye())) / 2;
  const box = det.detection.box;
  const faceWidthRatio = imageW > 0 ? box.width / imageW : 0;
  const detectionScore = det.detection.score;

  const frontal = noseOffset <= ENROLL_FRONTAL_NOSE_OFFSET_MAX;
  const eyesOpen = ear >= ENROLL_OPEN_EYE_EAR_MIN;
  const sharp = blurVariance >= ENROLL_MIN_BLUR_VARIANCE;
  const unobstructed =
    detectionScore >= ENROLL_MIN_DETECTION_SCORE &&
    faceWidthRatio >= ENROLL_MIN_FACE_WIDTH_RATIO &&
    isLandmarksUnobstructed(det, imageW, imageH);

  return {
    frontal,
    eyesOpen,
    sharp,
    unobstructed,
    detectionScore,
    blurVariance,
    ear,
    noseOffset,
    faceWidthRatio,
  };
}

function passesFrameQc(metrics: EnrollFrameMetrics): boolean {
  return metrics.frontal && metrics.eyesOpen && metrics.sharp && metrics.unobstructed;
}

function computeQualityScore(metrics: EnrollFrameMetrics, avgPairwiseSim: number): number {
  const blurNorm = Math.min(1, metrics.blurVariance / 400);
  return metrics.detectionScore * 0.25 + blurNorm * 0.25 + avgPairwiseSim * 0.5;
}

/** 从文件提取描述子并评估单帧质检指标 */
export async function extractEnrollmentCandidate(file: File): Promise<EnrollCandidate | null> {
  const img = await loadFileToImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);

  const det = await faceapi
    .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) return null;

  const blurVariance = computeBlurVariance(canvas, det.detection.box);
  const metrics = assessFrame(det, blurVariance, canvas.width, canvas.height);
  if (!passesFrameQc(metrics)) return null;

  return {
    file,
    descriptor: det.descriptor,
    metrics,
    qualityScore: computeQualityScore(metrics, 0),
  };
}

function enrichWithPairwiseScores(candidates: EnrollCandidate[]): EnrollCandidate[] {
  return candidates.map((c, i) => {
    let simSum = 0;
    let simCount = 0;
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      simSum += descriptorSimilarity(c.descriptor, candidates[j].descriptor);
      simCount++;
    }
    const avgPairwiseSim = simCount > 0 ? simSum / simCount : 0;
    return {
      ...c,
      qualityScore: computeQualityScore(c.metrics, avgPairwiseSim),
    };
  });
}

/** 剔除侧脸/不一致帧，按质量选取 3–6 张 */
export function selectEnrollmentPhotos(
  rawCandidates: EnrollCandidate[],
  maxCount = ENROLL_MAX_PHOTOS,
): EnrollCandidate[] {
  if (rawCandidates.length === 0) return [];

  const scored = enrichWithPairwiseScores(rawCandidates)
    .filter((c) => {
      if (rawCandidates.length <= 2) return true;
      let bestSim = 0;
      for (const other of rawCandidates) {
        if (other === c) continue;
        bestSim = Math.max(bestSim, descriptorSimilarity(c.descriptor, other.descriptor));
      }
      return bestSim >= ENROLL_PAIRWISE_MIN_SIM;
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);

  const picked: EnrollCandidate[] = [];
  for (const c of scored) {
    if (picked.length >= maxCount) break;
    if (picked.length === 0) {
      picked.push(c);
      continue;
    }
    const ok = picked.some(
      (p) => descriptorSimilarity(p.descriptor, c.descriptor) >= ENROLL_PAIRWISE_MIN_SIM,
    );
    if (ok) picked.push(c);
  }

  if (picked.length < Math.min(ENROLL_MIN_PHOTOS, maxCount) && scored.length >= picked.length) {
    for (const c of scored) {
      if (picked.length >= Math.min(ENROLL_MIN_PHOTOS, maxCount)) break;
      if (!picked.includes(c)) picked.push(c);
    }
  }

  return picked.slice(0, maxCount);
}

/** 录入严模式：在常规 3~6 张质检通过后，附加帧间互配门槛（阈值来自 face.enroll_strict.* 配置） */
export function passesStrictEnrollmentGate(
  candidates: EnrollCandidate[],
  thresholds: FaceEnrollStrictThresholds = DEFAULT_FACE_ENROLL_STRICT,
  minPhotos = ENROLL_MIN_PHOTOS,
): { pass: boolean; reason?: string } {
  if (candidates.length < minPhotos) {
    return { pass: false, reason: `合格正脸照不足 ${minPhotos} 张` };
  }

  const maxSimPerPhoto = candidates.map(() => 0);
  const pairwise: number[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const sim = descriptorSimilarity(candidates[i].descriptor, candidates[j].descriptor);
      pairwise.push(sim);
      maxSimPerPhoto[i] = Math.max(maxSimPerPhoto[i], sim);
      maxSimPerPhoto[j] = Math.max(maxSimPerPhoto[j], sim);
    }
  }

  const countAbovePairMin = maxSimPerPhoto.filter((s) => s >= thresholds.pairMinSim).length;
  if (countAbovePairMin >= thresholds.minCountAbovePair) {
    return { pass: true };
  }

  const maxPair = pairwise.length > 0 ? Math.max(...pairwise) : 0;
  const sorted = [...maxSimPerPhoto].sort((a, b) => b - a);
  const top2Avg =
    sorted.length >= 2 ? (sorted[0] + sorted[1]) / 2 : sorted[0] ?? 0;

  if (maxPair >= thresholds.maxPairSim && top2Avg >= thresholds.top2AvgMin) {
    return { pass: true };
  }

  return {
    pass: false,
    reason: formatStrictEnrollmentFailReason(thresholds),
  };
}

/** 对暂存文件做完整质检并选出入库集 */
export async function processEnrollmentFiles(
  files: File[],
  options: {
    strictMode?: boolean;
    strictThresholds?: FaceEnrollStrictThresholds;
    maxUploadCount?: number;
    minPhotos?: number;
  } = {},
): Promise<EnrollQcResult> {
  const maxUploadCount = options.maxUploadCount ?? ENROLL_MAX_PHOTOS;
  const minPhotos = options.minPhotos ?? Math.min(ENROLL_MIN_PHOTOS, maxUploadCount);
  const candidates: EnrollCandidate[] = [];
  let rejectedCount = 0;

  for (const file of files) {
    const c = await extractEnrollmentCandidate(file);
    if (c) candidates.push(c);
    else rejectedCount++;
  }

  if (candidates.length < minPhotos) {
    return {
      selected: [],
      rejectedCount,
      reason: `合格正脸照不足 ${minPhotos} 张（需正脸、睁眼、清晰、无遮挡）`,
    };
  }

  const selected = selectEnrollmentPhotos(candidates, maxUploadCount);
  if (selected.length < minPhotos) {
    return {
      selected: [],
      rejectedCount,
      reason: `通过一致性筛选的照片不足 ${minPhotos} 张，请重新录入`,
    };
  }

  if (options.strictMode) {
    const strictThresholds = options.strictThresholds ?? DEFAULT_FACE_ENROLL_STRICT;
    const strict = passesStrictEnrollmentGate(selected, strictThresholds, minPhotos);
    if (!strict.pass) {
      return { selected: [], rejectedCount, reason: strict.reason };
    }
  }

  return { selected, rejectedCount };
}
