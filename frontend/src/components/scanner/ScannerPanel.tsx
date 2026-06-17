import { useRef, useState, useCallback, useEffect } from 'react';
import { ScanFace, Loader2, X } from 'lucide-react';
import { Z_INDEX } from '@/constants/zIndex';
import { searchPersonnel } from '@/api/domains/profile.api';
import { useAnalyzeScanMutation, useExecuteAccessMutation } from '@/api/hooks/useScanner';
import type { AnalyzeResponse, ExecutePayload } from '@/api/types/scanner';
import {
    cancelScheduledAutoExit,
    noteScanExecuteSuccess,
    setScanExecutePending,
    setScanPopupSession,
    tryBeginScanChannel,
} from '@/components/scanner/scanSessionGuard';
import { UiverseProfilePopup } from './UiverseProfilePopup';
import { StudentDahuaBindPanel } from './StudentDahuaBindPanel';
import { RepeatedSwipeWarningBanner } from './RepeatedSwipeWarningBanner';
import { AnimatePresence } from 'framer-motion';
import {
    FaceDynamicIsland,
    FaceCameraWindow,
    FacePipMonitor,
    FaceResultToast,
    FaceEnrollment,
    useScanFaceVerify,
    isGateFacePhase,
    shouldKeepFaceCameraSession,
    shouldGateFaceVerifyOnScan,
} from '@/components/face-verify';
import { PIP_LOST_SECONDS, FACE_MAX_RETRIES_PROMPT_MS, faceVerifyFailedLabel, isFaceVerifyExhausted } from '@/components/face-verify/faceConfig';
import type { ScanStatus } from '@/components/face-verify';
import { uploadBaselinePhoto } from '@/api/domains/face.api';
import { specialChannelLoginByFace } from './specialChannel.api';
import type { AuthData } from '@/api/domains/auth.api';

const toHalfWidth = (value: string) =>
    value.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/\u3000/g, " ");

export default function ScannerPanel() {

    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [executeErrorMessage, setExecuteErrorMessage] = useState('');
    const [swipeWarning, setSwipeWarning] = useState<string | null>(null);
    const [swipeWarningKey, setSwipeWarningKey] = useState(0);
    const [swipeBlockedUntil, setSwipeBlockedUntil] = useState(0);
    const [lastScannedId, setLastScannedId] = useState('');
    const lastScannedIdRef = useRef('');

    // 中文转 ID 期间的专属加载状态
    const [isSearchingName, setIsSearchingName] = useState(false);
    const [isComposing, setIsComposing] = useState(false);

    const [activeResult, setActiveResult] = useState<AnalyzeResponse | null>(null);
    const [studentBindOpen, setStudentBindOpen] = useState(false);
    const [studentBindTarget, setStudentBindTarget] = useState<{ userId: string; userName: string } | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const studentCenterSuccessRef = useRef<((authData: AuthData) => void) | null>(null);

    // ==================== 人脸验证（共享 hook） ====================
    const fv = useScanFaceVerify();

    const handleFaceDone = useCallback((success: boolean) => {
        fv.handleFaceDone(success, (data) => {
            setActiveResult(data);
            const uid = data.userInfo?.userId ? String(data.userInfo.userId) : '';
            setScanPopupSession(uid || null, lastScannedIdRef.current);
            resetCloseTimer();
        });
    }, [fv.handleFaceDone]);


    const resetCloseTimer = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setInputValue('');
            setLastScannedId('');
            setActiveResult(null);
            setExecuteErrorMessage('');
            analyzeMutation.reset();
            executeMutation.reset();
        }, 600000); // 10min 兜底，实际由 PIP 人脸监测控制
    };

    const analyzeMutation = useAnalyzeScanMutation({
        onSuccess: (data) => {
            setExecuteErrorMessage('');
            const uid = data.userInfo?.userId ? String(data.userInfo.userId) : "";
            // 扫码阶段人脸验证（未绑物理卡人员跳过；pin_alternative 仅影响个人中心入口）
            if (shouldGateFaceVerifyOnScan(data, fv.faceAuthRequired)) {
                setActiveResult(null);
                fv.beginGateFaceVerify(data);
                setScanPopupSession(uid || null, lastScannedIdRef.current);
                return;
            }
            setActiveResult(data);
            setScanPopupSession(uid || null, lastScannedIdRef.current);
            resetCloseTimer();
        },
        onError: (error) => setErrorMsg(error.message || '无法解析该人员')
    });

    const executeMutation = useExecuteAccessMutation({
        onSuccess: (data, variables) => {
            const failedMessage = data.success === false ? (data.message || data.msg || '操作被拒绝') : '';
            setExecuteErrorMessage(failedMessage);
            if (failedMessage) {
                setErrorMsg(failedMessage);
                return;
            }
            if (variables?.userId && variables?.action) {
                noteScanExecuteSuccess(variables.userId, lastScannedIdRef.current, variables.action);
            }
            resetCloseTimer();
        },
        onError: (error) => {
            const message = error.message || '操作被拒绝';
            setErrorMsg(message);
            setExecuteErrorMessage(message);
        }
    });

    const runExecute = (payload: ExecutePayload) => {
        setScanExecutePending(payload.userId);
        executeMutation.mutate(payload, {
            onSettled: () => setScanExecutePending(null),
        });
    };

    // =========================================================
    // 💥 核心 1：剥离出绝对纯净的“标准物理扫码扳机”
    // =========================================================
    const triggerStandardScan = (hardwareId: string) => {
        const guard = tryBeginScanChannel(hardwareId, activeResult?.userInfo?.userId);
        if (!guard.allow) {
            setSwipeWarning(guard.message);
            setSwipeWarningKey((k) => k + 1);
            setSwipeBlockedUntil(guard.blockedUntil);
            return;
        }
        lastScannedIdRef.current = hardwareId;
        setLastScannedId(hardwareId);
        analyzeMutation.mutate(hardwareId || 'RANDOM');
    };

    // =========================================================
    // 💥 核心 2：带“暴力弹窗探针”的拦截器
    // =========================================================
    const handleScan = async () => {
        const cleanValue = toHalfWidth(String(inputValue)).trim();
        if (!cleanValue) return;

        setErrorMsg('');
        setExecuteErrorMessage('');
        executeMutation.reset();

        const hasChinese = /[\u4e00-\u9fa5]/.test(cleanValue);

        if (hasChinese) {
            try {
                setIsSearchingName(true);
                // 1. 发起请求
                const rawResponse = await searchPersonnel(cleanValue);

                // 2. 强力脱壳：不管后端怎么包，我们把真实的数组挖出来
                const personList = rawResponse;

                if (personList && personList.length > 0) {
                    const person = personList[0] as unknown as Record<string, string | undefined>;

                    const realUserId = person.user_id
                        || person.userId
                        || person.id
                        || person.card_no    // 可能是物理卡号
                        || person.emp_no     // 可能是工号
                        || person.work_no
                        || person.person_id;

                    if (!realUserId) {
                        setErrorMsg(`未匹配到 ID！请看刚才的弹窗里，ID 字段到底叫啥？`);
                        return;
                    }

                    console.log(`✅ 解析成功！正在物理填入 ID: [${realUserId}] 并触发回车...`);

                    // 像硬件一样物理填入
                    setInputValue(toHalfWidth(String(realUserId)).toUpperCase());
                    // 触发扫码
                    triggerStandardScan(toHalfWidth(String(realUserId)).trim());

                } else {
                    setErrorMsg(`查无此人：档案库中未找到名为“${cleanValue}”的人员`);
                }
            } catch (error) {
                console.error("搜索名字崩溃:", error);
                setErrorMsg('检索人员姓名异常，请检查网络状态');
            } finally {
                setIsSearchingName(false);
            }
        } else {
            // 纯数字或字母，直接扫码
            const normalized = cleanValue.toUpperCase();
            setInputValue(normalized);
            triggerStandardScan(normalized);
        }
    };

    // 汇总加载状态，保护输入框防连点
    const isWorking = analyzeMutation.isPending || executeMutation.isPending || isSearchingName;

    const closeScanPopup = useCallback(() => {
        setStudentBindOpen(false);
        setActiveResult(null);
        fv.abortFaceVerifySession();
        fv.dismissMaxRetriesPrompt();
        setExecuteErrorMessage('');
        analyzeMutation.reset();
        executeMutation.reset();
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        setScanPopupSession(null, null);
        cancelScheduledAutoExit();
    }, [analyzeMutation, executeMutation, fv]);

    const handlePopupFaceVerifyRequest = useCallback(() => {
        if (!activeResult) return;
        fv.onFaceSuccessOverrideRef.current = (data) => {
            const uid = data.userInfo?.userId ? String(data.userInfo.userId) : '';
            if (!uid) return;
            void specialChannelLoginByFace(uid)
                .then((authData) => studentCenterSuccessRef.current?.(authData))
                .catch((e) => setErrorMsg(e instanceof Error ? e.message : '人脸验证登录失败'));
        };
        fv.beginPersonalFaceVerify(activeResult);
    }, [activeResult, fv]);

    const handlePopupFaceVerifyCancel = useCallback(() => {
        fv.abortFaceVerifySession();
    }, [fv]);

    const isGateFace = isGateFacePhase(fv.faceVerifyActive, fv.faceVerifyCompact);
    const showScanPopup = Boolean(activeResult) && !isGateFace;
    const showGateFaceCamera = isGateFace;
    const pipUserId = activeResult?.userInfo?.userId ? String(activeResult.userInfo.userId) : '';
    const pipMonitorActive = Boolean(pipUserId) && !fv.faceVerifyActive && fv.pipMonitorUrls.length > 0;

    return (
        <div className="h-full w-full flex flex-col relative">
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                paddingBottom: '10px',
                marginBottom: '10px'
            }} className="shrink-0">
                <div style={{
                    fontSize: '14px',
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#1d1d1f'
                }}>
                    <div style={{
                        width: '6px',
                        height: '6px',
                        background: '#ff3b30',
                        borderRadius: '50%',
                        boxShadow: '0 0 8px #ff3b30'
                    }}></div>
                    终端访问录入
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-full max-w-[220px] relative">
                    <ScanFace className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]"/>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(toHalfWidth(e.target.value))}
                        onCompositionStart={() => setIsComposing(true)}
                        onCompositionEnd={(e) => {
                            setIsComposing(false);
                            setInputValue(toHalfWidth(e.currentTarget.value));
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !isComposing && !e.nativeEvent.isComposing) {
                                void handleScan();
                            }
                        }}
                        placeholder="键入 ID/名字或刷卡..."
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="text"
                        lang="en"
                        className="w-full bg-[#f8f9fa] border border-[#dcdfe6] rounded-[10px] pl-9 pr-4 py-2.5 font-mono text-[13px] text-[#1d1d1f] focus:bg-white focus:border-[#2d5cf7] focus:shadow-[0_0_0_3px_rgba(45,92,247,0.1)] outline-none transition-all"
                        disabled={isWorking}
                    />
                    {(analyzeMutation.isPending || isSearchingName) && (
                        <Loader2
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2d5cf7] animate-spin"/>
                    )}
                </div>
                {/* 手动人脸识别按钮 */}
                <button
                    onClick={() => {
                        if (!inputValue.trim()) { setErrorMsg('请先刷卡或输入ID'); return; }
                        const cleanValue = toHalfWidth(String(inputValue)).trim();
                        if (!/[一-龥]/.test(cleanValue)) {
                            // 纯ID：直接触发分析然后走人脸验证
                            lastScannedIdRef.current = cleanValue;
                            setLastScannedId(cleanValue);
                            analyzeMutation.mutate(cleanValue || 'RANDOM');
                        } else {
                            setErrorMsg('人脸识别请输入ID，不支持中文名');
                        }
                    }}
                    disabled={isWorking || fv.faceVerifyActive}
                    className="mt-2 w-full max-w-[220px] flex items-center justify-center gap-2
                        px-4 py-2 rounded-[10px] text-sm font-medium
                        bg-[var(--app-color-accent)] text-white
                        hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                    <ScanFace className="w-4 h-4" />
                    人脸识别
                </button>
                {errorMsg && (
                    <div className="mt-4 text-[12px] font-bold text-[#ff3b30] bg-[#ff3b30]/10 px-3 py-1.5 rounded-lg text-center">
                        {errorMsg}
                    </div>
                )}
            </div>

            {!isGateFace && (
            <AnimatePresence>
                {showScanPopup && activeResult && (
                    <UiverseProfilePopup
                        result={activeResult}
                        pinAlternativeEnabled={fv.pinAlternativeEnabled}
                        onFaceVerifyRequest={handlePopupFaceVerifyRequest}
                        onFaceVerifyCancel={handlePopupFaceVerifyCancel}
                        onBindStudentCenterSuccess={(handler) => { studentCenterSuccessRef.current = handler; }}
                        personalCenterFace={fv.faceVerifyActive && fv.faceVerifyCompact ? {
                            active: true,
                            open: shouldKeepFaceCameraSession(fv.islandStatus),
                            blinkPhase: fv.blinkPhase,
                            serverVerifying: fv.serverVerifying,
                            challengeAction: fv.challengeAction,
                            videoRef: fv.videoRef,
                            onStreamReady: fv.notifyCameraReady,
                            onStreamError: fv.notifyCameraError,
                            onClose: handlePopupFaceVerifyCancel,
                        } : undefined}
                        onClose={closeScanPopup}
                        onExecute={(payload) => runExecute(payload)}
                        isWorking={executeMutation.isPending}
                        executeData={executeMutation.data}
                        executeErrorMessage={executeErrorMessage}
                        isRefreshing={analyzeMutation.isPending}
                        onRefresh={() => lastScannedId && analyzeMutation.mutate(lastScannedId)}
                        onExecuteReset={() => executeMutation.reset()}
                        onOpenStudentBind={() => {
                            const uid = activeResult.userInfo?.userId;
                            if (!uid) return;
                            setStudentBindTarget({ userId: uid, userName: activeResult.userInfo?.name || "" });
                            setStudentBindOpen(true);
                            setActiveResult(null);
                            analyzeMutation.reset();
                            executeMutation.reset();
                            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                        }}
                        onViolationInteractiveVerified={(patch) => {
                            // 保存后仅合并当前扫码结果，禁止整表 load（post-save-no-full-refresh.mdc）
                            setActiveResult((prev) => {
                                if (!prev?.studentViolationNotice || prev.studentViolationNotice.id !== patch.violationId) {
                                    return prev;
                                }
                                if (patch.violationExpired) {
                                    return { ...prev, studentViolationNotice: undefined };
                                }
                                return {
                                    ...prev,
                                    studentViolationNotice: {
                                        ...prev.studentViolationNotice,
                                        enterLocked: patch.enterLocked,
                                        interactiveChallengeVerified: patch.interactiveChallengeVerified,
                                        pastExpireAwaitingInteractive: false,
                                    },
                                };
                            });
                            // 轻量 re-analyze 同步进房按钮与规则字段（非整表刷新）
                            const cardId = lastScannedIdRef.current;
                            if (cardId && !patch.violationExpired) {
                                analyzeMutation.mutate(cardId, {
                                    onSuccess: (data) => setActiveResult(data),
                                });
                            }
                        }}
                    />
                )}
            </AnimatePresence>
            )}

            <FacePipMonitor
                active={pipMonitorActive}
                userId={pipUserId}
                lostWarningSeconds={PIP_LOST_SECONDS}
                onTimeout={closeScanPopup}
                onWrongPerson={closeScanPopup}
            />

            {/* 重复刷卡警告 — 独立于 Popup 渲染，使用自己的 createPortal(document.body)。
                 原先在 ScanPopupNoticeCoordinator 内部，被 violation/unbound/announcement
                 的 return-null 守卫截断，导致无违规/公告时警告弹窗永远不显示。 */}
            <RepeatedSwipeWarningBanner message={swipeWarning} triggerKey={swipeWarningKey} blockedUntil={swipeBlockedUntil} />

            {/* 人脸验证：Dynamic Island + 摄像头 + 提示 */}
            {fv.faceVerifyActive && (
                <>
                    <FaceDynamicIsland
                        status={fv.islandStatus}
                        retryAttempt={fv.retryCount}
                        failedLabel={fv.cameraErrorLabel ?? faceVerifyFailedLabel(fv.faceStatus)}
                        onStatusComplete={(s) => {
                            if (s === 'success') handleFaceDone(true);
                            else if (s === 'failed' && isFaceVerifyExhausted(fv.faceStatus, fv.retryCount)) {
                                fv.handleFaceMaxRetriesExhausted();
                            }
                        }}
                    />
                    {showGateFaceCamera && (
                    <FaceCameraWindow
                        key="gate-face-camera"
                        cameraOwner="gate"
                        cameraWarm
                        videoRef={fv.videoRef}
                        open={shouldKeepFaceCameraSession(fv.islandStatus)}
                        blinkPhase={fv.blinkPhase}
                        serverVerifying={fv.serverVerifying}
                        challengeAction={fv.challengeAction}
                        onStreamReady={fv.notifyCameraReady}
                        onStreamError={fv.notifyCameraError}
                        onClose={() => {
                            fv.abortFaceVerifySession();
                        }}
                    />
                    )}
                </>
            )}
            {fv.baselineMissingPrompt?.open && (
                <FaceResultToast
                    message="该人员暂无人脸底库，请先录入人脸照片后再验证"
                    type="error"
                    duration={0}
                    onDismiss={fv.dismissBaselineMissingPrompt}
                    action={{
                        label: '录入人脸照片',
                        onClick: () => {
                            fv.openReEnroll(
                                fv.baselineMissingPrompt!.userId,
                                fv.baselineMissingPrompt!.personal,
                            );
                            fv.dismissBaselineMissingPrompt();
                        },
                    }}
                    open
                />
            )}
            {fv.maxRetriesPrompt?.open && (
                <FaceResultToast
                    message="验证失败已达上限，请重新刷卡"
                    type="error"
                    duration={FACE_MAX_RETRIES_PROMPT_MS}
                    onDismiss={fv.dismissMaxRetriesPrompt}
                    open
                />
            )}
            {fv.reEnrollOpen && fv.reEnrollUserIdRef.current && (
                <FaceEnrollment
                    userId={fv.reEnrollUserIdRef.current}
                    replaceExisting
                    uploadFn={async (file) => uploadBaselinePhoto(fv.reEnrollUserIdRef.current, file)}
                    onCaptured={() => {
                        const wasPersonal = fv.reEnrollRestartPersonalRef.current;
                        const data = fv.pendingAnalyzeData;
                        fv.closeReEnroll();
                        fv.dismissMaxRetriesPrompt();
                        fv.dismissBaselineMissingPrompt();
                        fv.invalidateFaceBaselineCache();
                        if (data) {
                            if (wasPersonal) fv.beginPersonalFaceVerify(data);
                            else fv.beginGateFaceVerify(data);
                        } else {
                            fv.abortFaceVerifySession();
                            setErrorMsg('人脸照片录入成功，请重新刷卡验证');
                        }
                    }}
                    onCancel={() => {
                        fv.closeReEnroll();
                    }}
                />
            )}
            {studentBindOpen && studentBindTarget ? (
                <StudentDahuaBindPanel
                    userId={studentBindTarget.userId}
                    userName={studentBindTarget.userName}
                    onCancel={() => {
                        setStudentBindOpen(false);
                        setStudentBindTarget(null);
                    }}
                    onSuccess={() => {
                        setStudentBindOpen(false);
                        setStudentBindTarget(null);
                        setActiveResult(null);
                        setExecuteErrorMessage("");
                        setInputValue("");
                        setLastScannedId("");
                        analyzeMutation.reset();
                        executeMutation.reset();
                        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                    }}
                />
            ) : null}
        </div>
    );
}