import { useState, useRef, useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useFaceAuthConfig } from './useFaceAuthConfig';
import { useFaceModels } from './useFaceModels';
import { useFaceVerification } from './useFaceVerification';
import type { ScanStatus } from './types';
import type { AnalyzeResponse } from '@/api/types/scanner';
import { fetchBaselinePhoto, deleteBaselinePhoto } from '@/api/domains/face.api';
import { logFaceVerifyFailure } from './faceLog';
import { faceAutoRetryDelayMs, FACE_VERIFY_MAX_RETRIES } from './faceConfig';
import { forceReleaseAllFaceCameras } from './faceCameraExclusive';
import { randomUUID } from '@/utils/randomUUID';

export interface MaxRetriesPromptState {
  open: boolean;
  userId: string;
}

export interface BaselineMissingPromptState {
  open: boolean;
  userId: string;
  /** 个人中心紧凑窗 vs 门禁全屏 */
  personal: boolean;
}

interface UseScanFaceVerifyReturn {
  faceVerifyActive: boolean;
  setFaceVerifyActive: Dispatch<SetStateAction<boolean>>;
  faceVerifyCompact: boolean;
  setFaceVerifyCompact: Dispatch<SetStateAction<boolean>>;
  islandStatus: ScanStatus;
  setIslandStatus: Dispatch<SetStateAction<ScanStatus>>;
  pendingAnalyzeData: AnalyzeResponse | null;
  setPendingAnalyzeData: Dispatch<SetStateAction<AnalyzeResponse | null>>;
  faceBaselineUrls: string[];
  faceStatus: ReturnType<typeof useFaceVerification>['status'];
  similarity: number | null;
  retryCount: number;
  blinkPhase: ReturnType<typeof useFaceVerification>['blinkPhase'];
  serverVerifying: ReturnType<typeof useFaceVerification>['serverVerifying'];
  challengeAction: ReturnType<typeof useFaceVerification>['challengeAction'];
  faceAuthRequired: boolean;
  pinAlternativeEnabled: boolean;
  faceStart: () => Promise<void>;
  faceStop: () => void;
  faceRetry: () => void;
  faceReset: () => void;
  handleFaceDone: (success: boolean, onSuccess: (data: AnalyzeResponse) => void) => void;
  /** 扫码门禁全屏人脸验证（analyze 成功后） */
  beginGateFaceVerify: (data: AnalyzeResponse) => void;
  /** 个人中心紧凑人脸验证（PIN 键盘摄像头挂载后） */
  beginPersonalFaceVerify: (data: AnalyzeResponse) => void;
  /** @deprecated 同 beginPersonalFaceVerify */
  onFaceVerifyRequest: (currentResult: AnalyzeResponse) => void;
  /** 取消/关弹窗/关摄像头：完整中止会话，避免状态残留 */
  abortFaceVerifySession: () => void;
  onFaceSuccessOverrideRef: React.MutableRefObject<((data: AnalyzeResponse) => void) | null>;
  reEnrollOpen: boolean;
  reEnrollUserIdRef: React.MutableRefObject<string>;
  reEnrollRestartPersonalRef: React.MutableRefObject<boolean>;
  openReEnroll: (userId: string, personalRestart?: boolean) => void;
  closeReEnroll: () => void;
  maxRetriesPrompt: MaxRetriesPromptState | null;
  handleFaceMaxRetriesExhausted: () => void;
  dismissMaxRetriesPrompt: () => void;
  baselineMissingPrompt: BaselineMissingPromptState | null;
  dismissBaselineMissingPrompt: () => void;
  invalidateFaceBaselineCache: () => void;
  notifyCameraReady: () => void;
  notifyCameraError: (message: string) => void;
  cameraErrorLabel: string | null;
  pipBaselineUrlsRef: React.MutableRefObject<string[]>;
  pipMonitorUrls: string[];
  setPipMonitorUrls: Dispatch<SetStateAction<string[]>>;
  faceVerifyTokenRef: React.MutableRefObject<string | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

/** 扫码门禁全尺寸人脸阶段（非个人中心紧凑窗） */
export function isGateFacePhase(active: boolean, compact: boolean): boolean {
  return active && !compact;
}

/** 识别中 / 失败待重试：保持视频窗与摄像头，避免反复开关 */
export function shouldKeepFaceCameraSession(islandStatus: ScanStatus): boolean {
  return islandStatus === 'scanning' || islandStatus === 'failed';
}

/** 扫码 analyze 成功后是否应启动门禁人脸验证（未绑物理卡人员不走刷脸+刷卡组合验证） */
export function shouldGateFaceVerifyOnScan(
  data: AnalyzeResponse,
  faceAuthRequired: boolean,
): boolean {
  if (!faceAuthRequired) return false;
  const uid = data.userInfo?.userId ? String(data.userInfo.userId) : '';
  if (!uid) return false;
  if (data.hasPhysicalCardMapping === false) return false;
  if (data.unboundCardNotice?.id != null) return false;
  return true;
}

export function useScanFaceVerify(): UseScanFaceVerifyReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [faceVerifyActive, setFaceVerifyActive] = useState(false);
  const [faceVerifyCompact, setFaceVerifyCompact] = useState(false);
  const [islandStatus, setIslandStatus] = useState<ScanStatus>('idle');
  const [pendingAnalyzeData, setPendingAnalyzeData] = useState<AnalyzeResponse | null>(null);
  const [faceBaselineUrls, setFaceBaselineUrls] = useState<string[]>([]);
  const [reEnrollOpen, setReEnrollOpen] = useState(false);
  const [maxRetriesPrompt, setMaxRetriesPrompt] = useState<MaxRetriesPromptState | null>(null);
  const [baselineMissingPrompt, setBaselineMissingPrompt] = useState<BaselineMissingPromptState | null>(null);
  const reEnrollRestartPersonalRef = useRef(false);
  const reEnrollUserIdRef = useRef('');
  const pipBaselineUrlsRef = useRef<string[]>([]);
  const [pipMonitorUrls, setPipMonitorUrls] = useState<string[]>([]);
  const [cameraErrorLabel, setCameraErrorLabel] = useState<string | null>(null);
  const verifySessionIdRef = useRef('');
  const faceVerifyTokenRef = useRef<string | null>(null);
  const processedUserIdRef = useRef<string | null>(null);
  const baselineEpochRef = useRef(0);
  const lastBaselineFetchKeyRef = useRef<string | null>(null);
  const baselineReadyRef = useRef(false);
  const cameraReadyRef = useRef(false);
  const faceVerifyActiveRef = useRef(false);
  faceVerifyActiveRef.current = faceVerifyActive;
  const faceVerifyCompactRef = useRef(false);
  faceVerifyCompactRef.current = faceVerifyCompact;
  const verifyStartedRef = useRef(false);

  const { masterEnabled, isEnabled } = useFaceAuthConfig();
  const faceAuthRequired = masterEnabled && isEnabled('face.scan_popup.enabled');
  const pinAlternativeEnabled = isEnabled('face.pin_alternative.enabled');

  useFaceModels();

  const faceVerifyOptions = useMemo(() => ({
    userId: pendingAnalyzeData?.userInfo?.userId ? String(pendingAnalyzeData.userInfo.userId) : undefined,
    userName: pendingAnalyzeData?.userInfo?.name,
    baselineCount: faceBaselineUrls.length,
    sessionId: verifySessionIdRef.current || undefined,
    source: faceVerifyCompact ? 'personal' : 'gate',
    onVerifyToken: (token: string) => {
      faceVerifyTokenRef.current = token;
    },
  }), [pendingAnalyzeData, faceBaselineUrls.length, faceVerifyCompact]);

  const { status: faceStatus, similarity, retryCount, blinkPhase, serverVerifying, challengeAction, start: faceStart, stop: faceStop, retry: faceRetry, reset: faceReset } =
    useFaceVerification(videoRef, faceBaselineUrls, faceVerifyOptions);

  const faceStatusRef = useRef(faceStatus);
  faceStatusRef.current = faceStatus;

  const faceStartRef = useRef(faceStart);
  faceStartRef.current = faceStart;
  const faceRetryRef = useRef(faceRetry);
  faceRetryRef.current = faceRetry;

  const resetFaceVerifyRuntime = useCallback(() => {
    verifyStartedRef.current = false;
    cameraReadyRef.current = false;
    baselineReadyRef.current = false;
    lastBaselineFetchKeyRef.current = null;
    processedUserIdRef.current = null;
  }, []);

  const tryStartVerification = useCallback(() => {
    if (!faceVerifyActiveRef.current) return;
    if (!baselineReadyRef.current || !cameraReadyRef.current) return;
    if (verifyStartedRef.current) return;
    verifyStartedRef.current = true;
    setIslandStatus('scanning');
    void faceStartRef.current();
  }, []);

  const invalidateFaceBaselineCache = useCallback(() => {
    baselineEpochRef.current += 1;
    lastBaselineFetchKeyRef.current = null;
    processedUserIdRef.current = null;
    pipBaselineUrlsRef.current = [];
    baselineReadyRef.current = false;
    setFaceBaselineUrls([]);
  }, []);

  const prepareFaceVerifySession = useCallback(() => {
    resetFaceVerifyRuntime();
    baselineEpochRef.current += 1;
    verifySessionIdRef.current = randomUUID();
    faceVerifyTokenRef.current = null;
    setCameraErrorLabel(null);
    faceStop();
    faceReset();
    setFaceBaselineUrls([]);
    setIslandStatus('idle');
  }, [faceStop, faceReset, resetFaceVerifyRuntime]);

  const notifyCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
    setCameraErrorLabel(null);
    // 摄像头晚于首轮 faceStart 才就绪：解除启动锁，避免 verifyStarted 卡死导致无法重试
    const abruptStale =
      faceVerifyActiveRef.current &&
      verifyStartedRef.current &&
      baselineReadyRef.current &&
      (faceStatusRef.current === 'timeout' || faceStatusRef.current === 'noFace');
    if (abruptStale) {
      verifyStartedRef.current = false;
      faceReset();
      setIslandStatus('idle');
    }
    tryStartVerification();
  }, [tryStartVerification, faceReset]);

  const notifyCameraError = useCallback((message: string) => {
    cameraReadyRef.current = false;
    verifyStartedRef.current = false;
    setCameraErrorLabel(message);
    setIslandStatus('failed');
  }, []);

  useEffect(() => {
    if (!faceVerifyActive) {
      resetFaceVerifyRuntime();
    }
  }, [faceVerifyActive, resetFaceVerifyRuntime]);

  // 拉取底库（仅写入 urls，不立即 start——避免 setState 未刷新导致 urlsRef 为空）
  useEffect(() => {
    const userId = pendingAnalyzeData?.userInfo?.userId;
    if (!userId || !faceVerifyActive) {
      setFaceBaselineUrls([]);
      processedUserIdRef.current = null;
      lastBaselineFetchKeyRef.current = null;
      baselineReadyRef.current = false;
      return;
    }
    const fetchKey = `${String(userId)}@${baselineEpochRef.current}`;
    if (lastBaselineFetchKeyRef.current === fetchKey) return;
    lastBaselineFetchKeyRef.current = fetchKey;
    processedUserIdRef.current = String(userId);
    baselineReadyRef.current = false;
    (async () => {
      try {
        const baseline = await fetchBaselinePhoto(String(userId));
        const urls = baseline?.urls?.length ? baseline.urls : [];
        pipBaselineUrlsRef.current = urls;
        if (urls.length === 0) {
          logFaceVerifyFailure('baseline_unavailable', {
            source: faceVerifyCompactRef.current ? 'personal' : 'gate',
            userId: String(userId),
            userName: pendingAnalyzeData?.userInfo?.name,
          });
          setFaceVerifyActive(false);
          setFaceVerifyCompact(false);
          setIslandStatus('idle');
          setBaselineMissingPrompt({
            open: true,
            userId: String(userId),
            personal: faceVerifyCompactRef.current,
          });
          return;
        }
        if (!faceVerifyActiveRef.current) return;
        setFaceBaselineUrls(urls);
        baselineReadyRef.current = true;
        tryStartVerification();
      } catch (e) {
        logFaceVerifyFailure('baseline_load_error', {
          source: 'scan',
          userId: String(userId),
          userName: pendingAnalyzeData?.userInfo?.name,
          detail: e instanceof Error ? e.message : String(e),
        });
        setFaceVerifyActive(false);
        setIslandStatus('idle');
      }
    })();
  }, [pendingAnalyzeData, faceVerifyActive, tryStartVerification]);

  // faceStatus → islandStatus
  useEffect(() => {
    if (faceStatus === 'matched') setIslandStatus('success');
    else if (faceStatus === 'mismatched') setIslandStatus('failed');
    else if (faceStatus === 'timeout' || faceStatus === 'maxRetries') setIslandStatus('failed');
    else if (faceStatus === 'noFace') setIslandStatus('failed');
  }, [faceStatus]);

  // 可重试的失败：仅首轮失败后自动重试；末轮失败由灵动岛展示后结束会话
  useEffect(() => {
    if (!faceVerifyActive || retryCount >= FACE_VERIFY_MAX_RETRIES - 1) return;

    const retryable = faceStatus === 'timeout' || faceStatus === 'mismatched';
    if (!retryable) return;

    const delayMs = faceAutoRetryDelayMs(retryCount);
    const timer = window.setTimeout(() => {
      void faceRetryRef.current();
      setIslandStatus('scanning');
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [faceVerifyActive, faceStatus, retryCount]);

  const onFaceSuccessOverrideRef = useRef<((data: AnalyzeResponse) => void) | null>(null);

  const abortFaceVerifySession = useCallback(() => {
    faceStop();
    faceReset();
    resetFaceVerifyRuntime();
    onFaceSuccessOverrideRef.current = null;
    setFaceVerifyActive(false);
    setFaceVerifyCompact(false);
    setIslandStatus('idle');
    setCameraErrorLabel(null);
    setPendingAnalyzeData(null);
    setFaceBaselineUrls([]);
    setPipMonitorUrls([]);
    forceReleaseAllFaceCameras();
  }, [faceStop, faceReset, resetFaceVerifyRuntime]);

  const beginGateFaceVerify = useCallback((data: AnalyzeResponse) => {
    prepareFaceVerifySession();
    onFaceSuccessOverrideRef.current = null;
    pipBaselineUrlsRef.current = [];
    setPipMonitorUrls([]);
    setPendingAnalyzeData(data);
    setFaceVerifyCompact(false);
    setFaceVerifyActive(true);
  }, [prepareFaceVerifySession]);

  const beginPersonalFaceVerify = useCallback((data: AnalyzeResponse) => {
    prepareFaceVerifySession();
    setPendingAnalyzeData(data);
    setFaceVerifyCompact(true);
    setFaceVerifyActive(true);
  }, [prepareFaceVerifySession]);

  const handleFaceDone = useCallback((success: boolean, onSuccess: (data: AnalyzeResponse) => void) => {
    setFaceVerifyActive(false);
    setFaceVerifyCompact(false);
    setIslandStatus('idle');
    faceStop();
    faceReset();
    resetFaceVerifyRuntime();
    if (success && pendingAnalyzeData) {
      setPipMonitorUrls(pipBaselineUrlsRef.current);
      if (onFaceSuccessOverrideRef.current) {
        onFaceSuccessOverrideRef.current(pendingAnalyzeData);
        onFaceSuccessOverrideRef.current = null;
      } else {
        onSuccess(pendingAnalyzeData);
      }
    } else {
      setPipMonitorUrls([]);
      onFaceSuccessOverrideRef.current = null;
    }
    setPendingAnalyzeData(null);
  }, [faceStop, faceReset, resetFaceVerifyRuntime, pendingAnalyzeData]);

  const openReEnroll = useCallback((userId: string, personalRestart = false) => {
    reEnrollUserIdRef.current = userId;
    reEnrollRestartPersonalRef.current = personalRestart;
    setMaxRetriesPrompt(null);
    invalidateFaceBaselineCache();
    setReEnrollOpen(true);
  }, [invalidateFaceBaselineCache]);

  const closeReEnroll = useCallback(() => setReEnrollOpen(false), []);

  const dismissMaxRetriesPrompt = useCallback(() => setMaxRetriesPrompt(null), []);

  const dismissBaselineMissingPrompt = useCallback(() => setBaselineMissingPrompt(null), []);

  /** 次数用尽：灵动岛展示结束后弹出 Toast，由用户手动点「录入人脸照片」 */
  const handleFaceMaxRetriesExhausted = useCallback(() => {
    const userId = pendingAnalyzeData?.userInfo?.userId
      ? String(pendingAnalyzeData.userInfo.userId)
      : '';
    reEnrollUserIdRef.current = userId;
    faceStop();
    faceReset();
    resetFaceVerifyRuntime();
    setFaceVerifyActive(false);
    setFaceVerifyCompact(false);
    setIslandStatus('idle');
    setPendingAnalyzeData(null);
    setPipMonitorUrls([]);
    onFaceSuccessOverrideRef.current = null;
    forceReleaseAllFaceCameras();
    if (userId) {
      setMaxRetriesPrompt({
        open: true,
        userId,
      });
    }
  }, [faceStop, faceReset, resetFaceVerifyRuntime, pendingAnalyzeData]);

  return {
    faceVerifyActive, setFaceVerifyActive, faceVerifyCompact, setFaceVerifyCompact,
    islandStatus, setIslandStatus,
    pendingAnalyzeData, setPendingAnalyzeData,
    faceBaselineUrls,
    faceStatus, similarity, retryCount, blinkPhase, serverVerifying, challengeAction,
    faceAuthRequired, pinAlternativeEnabled,
    faceStart, faceStop, faceRetry, faceReset,
    handleFaceDone,
    beginGateFaceVerify,
    beginPersonalFaceVerify,
    onFaceVerifyRequest: beginPersonalFaceVerify,
    abortFaceVerifySession,
    onFaceSuccessOverrideRef,
    reEnrollOpen, reEnrollUserIdRef, reEnrollRestartPersonalRef,
    openReEnroll, closeReEnroll,
    maxRetriesPrompt,
    handleFaceMaxRetriesExhausted,
    dismissMaxRetriesPrompt,
    baselineMissingPrompt,
    dismissBaselineMissingPrompt,
    invalidateFaceBaselineCache,
    notifyCameraReady,
    notifyCameraError,
    cameraErrorLabel,
    pipBaselineUrlsRef,
    pipMonitorUrls,
    setPipMonitorUrls,
    faceVerifyTokenRef,
    videoRef,
  };
}
