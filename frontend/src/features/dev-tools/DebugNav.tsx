import {useState, useRef, useEffect, useCallback} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {motion, AnimatePresence} from 'framer-motion';
// 💥 加上 Map as MapIcon
import {
    LayoutDashboard, ScrollText, Users, BrainCircuit, Sparkles, ScanFace, Loader2, X, ShoppingCart, Map as MapIcon,
    LogOut
} from 'lucide-react';
import { useAnalyzeScanMutation, useExecuteAccessMutation } from '@/api/hooks/useScanner';
import type { AnalyzeResponse, RoomInfo } from '@/api/types/scanner';
import {UiverseProfilePopup} from '@/components/scanner/UiverseProfilePopup';
import { StudentDahuaBindPanel } from '@/components/scanner/StudentDahuaBindPanel';
import { PopupErrorBoundary } from '@/components/scanner/PopupErrorBoundary';
import { SwipeExitConfirmDialog } from '@/components/scanner/SwipeExitConfirmDialog';
import { RepeatedSwipeWarningBanner } from '@/components/scanner/RepeatedSwipeWarningBanner';
import { fetchAccessRuleScanLinkageConfig } from '@/api/twinApi';
import {CreditCard } from 'lucide-react';
import { authStorage } from '@/features/auth/authStorage';
import { hasMinRole } from '@/features/auth/roleAccess';
import { useTwinChromeTheme } from '@/features/twin-chrome/TwinChromeThemeContext';
import { useTheme } from '@/features/theme/ThemeProvider';
import { ThemeSwitcher } from '@/features/theme/ThemeSwitcher';
import type { ExecutePayload } from '@/api/types/scanner';
import {
    cancelScheduledAutoExit,
    canScheduleAutoExit,
    noteScanExecuteSuccess,
    setScanExecutePending,
    setScanPopupSession,
    tryBeginScanChannel,
} from '@/components/scanner/scanSessionGuard';
import { mergeViolationInteractiveAckIntoResult } from '@/components/scanner/twinViolationInteractive';
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
import { specialChannelLoginByFace } from '@/components/scanner/specialChannel.api';
import type { AuthData } from '@/api/domains/auth.api';
import { useCardReaderEnterGuard } from '@/components/scanner/useCardReaderEnterGuard';
import toast from 'react-hot-toast';

const DEBUG_NAV_RUNTIME_STAMP = "debug-nav-runtime-2026-04-16-r4";

export default function DebugNav() {
    const navigate = useNavigate();
    const location = useLocation();
    const { themeId, setThemeId } = useTwinChromeTheme();
    const { themeId: bentoThemeId } = useTheme();

    // 🍱 System A → System B 桥接：Bento 主题切换时同步 Twin Chrome 霓虹效果
    useEffect(() => {
        if (bentoThemeId === 'scifi') {
            setThemeId('dashboardSciFi');
        } else {
            setThemeId('standard');
        }
    }, [bentoThemeId, setThemeId]);

    const [hoveredPath, setHoveredPath] = useState<string | null>(null);

    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const errorDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inputClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** 设置错误消息并在 5 秒后自动消失 */
    const setAutoDismissError = useCallback((msg: string) => {
        if (errorDismissTimerRef.current) clearTimeout(errorDismissTimerRef.current);
        setErrorMsg(msg);
        errorDismissTimerRef.current = setTimeout(() => {
            setErrorMsg('');
        }, 5000);
    }, []);

    /** 清除错误消息和定时器 */
    const clearErrorMsg = useCallback(() => {
        if (errorDismissTimerRef.current) clearTimeout(errorDismissTimerRef.current);
        setErrorMsg('');
    }, []);

    /** 延迟清空输入框（2 秒后） */
    const scheduleClearInput = useCallback(() => {
        if (inputClearTimerRef.current) clearTimeout(inputClearTimerRef.current);
        inputClearTimerRef.current = setTimeout(() => {
            setInputValue('');
            setErrorMsg('');
        }, 2000);
    }, []);

    const [executeErrorMessage, setExecuteErrorMessage] = useState('');
    const [lastScannedId, setLastScannedId] = useState('');
    const lastScannedIdRef = useRef('');

    const [activeResult, setActiveResult] = useState<AnalyzeResponse | null>(null);
    const [activeAutoSignoutSeconds, setActiveAutoSignoutSeconds] = useState<number | null>(null);

    // 读取离开确认开关配置（GET 公开可读）
    const { data: linkageCfg = {} } = useQuery({
        queryKey: ["access-rule-scan-linkage-config"],
        queryFn: fetchAccessRuleScanLinkageConfig,
        staleTime: 60_000,
    });
    const swipeExitSkipConfirm = (linkageCfg as any).swipeExitSkipConfirm === true;

    const [autoExitConfirm, setAutoExitConfirm] = useState<ExecutePayload | null>(null);

    // 重复刷卡全屏脉冲警告
    const [swipeWarning, setSwipeWarning] = useState<string | null>(null);
    const [swipeWarningKey, setSwipeWarningKey] = useState(0);

    const [studentBindOpen, setStudentBindOpen] = useState(false);
    const [studentBindTarget, setStudentBindTarget] = useState<{ userId: string; userName: string } | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const studentCenterSuccessRef = useRef<((authData: AuthData) => void) | null>(null);

    // ==================== 人脸验证（共享 hook） ====================
    const fv = useScanFaceVerify();

    const handleFaceDone = useCallback((success: boolean) => {
        fv.handleFaceDone(success, (data) => {
            setActiveResult(data);
            setActiveAutoSignoutSeconds(data.autoSignoutSecondsRemaining ?? null);
            resetCloseTimer();
            const uid = data.userInfo?.userId ? String(data.userInfo.userId) : '';
            setScanPopupSession(uid || null, lastScannedIdRef.current);
            setAutoActionRoomId('');
            const isBanned = Number(data.globalUserState) === 3;
            const autoSignoutActive = data.autoSignoutSecondsRemaining != null && data.autoSignoutSecondsRemaining > 0;
            if (
                data.currentState === 'INSIDE'
                && isHardwareScanRef.current
                && !isBanned
                && !autoSignoutActive
                && uid
                && canScheduleAutoExit(uid, lastScannedIdRef.current)
            ) {
                const targetRoom = data.pendingRooms?.[0];
                if (targetRoom) {
                    const roomId = (targetRoom as RoomInfo).officialRoomId || targetRoom.id;
                    setAutoActionRoomId(roomId);
                    setAutoExitConfirm({ userId: data.userInfo.userId, roomId, action: 'EXIT', isSharedCard: false, isKeepCard: false, isBorrowedCard: false });
                }
            }
            if (data.currentState === 'INSIDE') needsExitConfirmRef.current = true;
            isHardwareScanRef.current = false;
        });
    }, [fv.handleFaceDone]);

    // =========================================================
    // 💥 核心修复：彻底抛弃”弹窗生命周期锁”，改为”网络级极速锁”！
    // 只要接口返回数据（弹窗展现），扫码枪瞬间释放！支持无缝连扫，后扫的人直接覆盖前一个人！
    // =========================================================
    const scannerLockRef = useRef(false);
    // 💥 新增：物理硬件锁。用于区分”扫码枪扫入”和”后台自动刷新”
    const isHardwareScanRef = useRef(false);
    // 💥 1. 新增：视觉钢印。用来告诉底下的弹窗，现在是哪个房间在全自动离开
    const [autoActionRoomId, setAutoActionRoomId] = useState<string>('');
    const hasLoggedStampRef = useRef(false);
    // 仅硬件刷卡/手动扫码/输入回车这三种方式触发的离开需确认弹窗
    const needsExitConfirmRef = useRef(false);
    // 弹窗是否已打开（ref 版：全局 keydown 监听器因 [] deps 捕获过期闭包，必须用 ref 保持最新值）
    const activeResultRef = useRef<AnalyzeResponse | null>(null);
    useEffect(() => { activeResultRef.current = activeResult; }, [activeResult]);

    useEffect(() => {
        if (hasLoggedStampRef.current) return;
        hasLoggedStampRef.current = true;
        console.info("[RuntimeStamp] DebugNav", DEBUG_NAV_RUNTIME_STAMP);
    }, []);

    const analyzeMutation = useAnalyzeScanMutation({
        onSuccess: (data) => {
            if (data && data.success === false) {
                setAutoDismissError(data.message || `未检索到该人员信息：${lastScannedId}`);
                scheduleClearInput();
                isHardwareScanRef.current = false;
                return; // ⛔ 阻断执行，绝不调用 setActiveResult！
            }
            // 扫码阶段人脸验证（未绑物理卡人员跳过；pin_alternative 仅影响个人中心入口）
            const userId = data.userInfo?.userId ? String(data.userInfo.userId) : '';
            if (shouldGateFaceVerifyOnScan(data, fv.faceAuthRequired)) {
                setActiveResult(null);
                fv.beginGateFaceVerify(data);
                setScanPopupSession(userId || null, lastScannedIdRef.current);
                setAutoActionRoomId('');
                return;
            }
            setActiveResult(data);
            setActiveAutoSignoutSeconds(data.autoSignoutSecondsRemaining ?? null);
            resetCloseTimer();
            const uid = data.userInfo?.userId ? String(data.userInfo.userId) : "";
            setScanPopupSession(uid || null, lastScannedIdRef.current);
            // 每次扫码清空上一个视觉钢印
            setAutoActionRoomId('');

            // =========================================================
            // 💥 核心防爆锁：解析后端传来的风控状态 (3 代表被封禁)
            // =========================================================
            const isBanned = Number(data.globalUserState) === 3;
            // 自动签退计时器运行中时，ProfilePopup 已在展示倒计时 + 离开入口，
            // 此时不应再弹出 DebugNav 的确认离开弹窗，避免两个同 z=800 弹窗冲突
            const autoSignoutActive = data.autoSignoutSecondsRemaining != null && data.autoSignoutSecondsRemaining > 0;

            // 💥 终极拦截：只有真实硬件扫码 + 在馆内 + 【绝对没有被封禁】+ 无活跃自动签退计时器
            // 刚完成「进入」或弹窗内重复扫：canScheduleAutoExit / tryBeginScanChannel 已拦截，避免手抖连扫误离开
            if (
                data.currentState === 'INSIDE'
                && isHardwareScanRef.current
                && !isBanned
                && !autoSignoutActive
                && uid
                && canScheduleAutoExit(uid, lastScannedIdRef.current)
            ) {
                const targetRoom = data.pendingRooms?.[0];
                if (targetRoom) {
                    const roomId = (targetRoom as RoomInfo).officialRoomId || targetRoom.id;

                    // 立刻弹出确认离开弹窗（不再等 2 秒延迟）
                    setAutoActionRoomId(roomId);
                    setAutoExitConfirm({
                        userId: data.userInfo.userId,
                        roomId: roomId,
                        action: 'EXIT',
                        isSharedCard: false,
                        isKeepCard: false,
                        isBorrowedCard: false,
                    });
                }
            }

            // 💥 ENTER 的 runExecute 会清掉 needsExitConfirmRef，导致后续 EXIT 跳过确认弹窗。
            // 在馆内时重设：确保用户点「离开」按钮时走确认弹窗（含倒计时）。
            if (data.currentState === 'INSIDE') {
                needsExitConfirmRef.current = true;
            }

            isHardwareScanRef.current = false;
        },
        onError: (error) => {
            // 区分错误类型给出更明确的提示
            const axiosError = error as any;
            let message: string;
            if (axiosError?.response?.status === 404) {
                message = '未找到该人员，请检查卡号/ID';
            } else if (axiosError?.response?.status === 500) {
                message = '系统异常，请稍后重试';
            } else if (axiosError?.code === 'ERR_NETWORK' || axiosError?.message?.includes('Network')) {
                message = '网络异常，请检查连接后重试';
            } else {
                message = error.message || '无法解析该人员';
            }
            setAutoDismissError(message);
            scheduleClearInput();
            isHardwareScanRef.current = false;
        }
    });

    const executeMutation = useExecuteAccessMutation({
        onSuccess: (data, variables) => {
            const failedMessage = data.success === false ? (data.message || data.msg || '操作被拒绝') : '';
            setExecuteErrorMessage(failedMessage);
            if (failedMessage) {
                setAutoDismissError(failedMessage);
                return;
            }
            if (variables?.userId && variables?.action) {
                noteScanExecuteSuccess(variables.userId, lastScannedIdRef.current, variables.action);
            }
            resetCloseTimer();
        },
        onError: (error) => {
            // 💥 加上这行错误日志
            console.error("❌ [DebugNav - 报错了] 请求失败:", error);
            const message = error.message || '操作失败';
            setAutoDismissError(message);
            setExecuteErrorMessage(message);
            isHardwareScanRef.current = false;
        },
    });

    const doExecute = (payload: ExecutePayload) => {
        setScanExecutePending(payload.userId);
        executeMutation.mutate(payload, {
            onSettled: () => setScanExecutePending(null),
        });
    };

    const runExecute = (payload: ExecutePayload) => {
        // UiverseProfilePopup 已通过自身的 SwipeExitConfirmDialog 完成确认，
        // 此处不再重复弹窗，直接执行进出操作
        needsExitConfirmRef.current = false;
        doExecute(payload);
    };

    const handleScanAction = (code: string) => {
        const cleanValue = String(code).trim();
        if (!cleanValue) return;

        // 使用 ref 而非 state：全局 keydown 监听器因 [] deps 捕获过期闭包，ref 始终是最新值
        const currentPopupUser = activeResultRef.current?.userInfo?.userId;
        const guard = tryBeginScanChannel(cleanValue, currentPopupUser);
        if (!guard.allow) {
            // 弹窗已打开时重复刷卡 → 全屏红色脉冲警告；否则 → 底部 error toast
            if (activeResultRef.current !== null) {
                setSwipeWarning(guard.message);
                setSwipeWarningKey((k) => k + 1);
            } else {
                setAutoDismissError(guard.message);
            }
            isHardwareScanRef.current = false;
            return;
        }

        lastScannedIdRef.current = cleanValue;
        setLastScannedId(cleanValue);
        clearErrorMsg();
        setExecuteErrorMessage('');

        // 三种手动输入方式都需要离开确认弹窗检查
        needsExitConfirmRef.current = true;

        // 💥 打标签：这可是真正的扫码枪滴出来的！放行自动逻辑！
        isHardwareScanRef.current = true;

        analyzeMutation.mutate(cleanValue);
        executeMutation.reset();
    };

    // 💥 动态监听：只有在发请求的这几十毫秒内，扫码枪才是锁定的
    const isWorking = analyzeMutation.isPending || executeMutation.isPending;
    useEffect(() => {
        scannerLockRef.current = isWorking;
    }, [isWorking]);

    // 🔒 读卡器 Enter 键防护：capture 阶段拦截，防止连续刷卡时意外触发聚焦按钮
    useCardReaderEnterGuard("debug-scanner-input");

    const resetCloseTimer = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setInputValue('');
            setLastScannedId('');
            setActiveResult(null);
            setSwipeWarning(null);
            analyzeMutation.reset();
            executeMutation.reset();
            setIsScannerOpen(false);
        }, 120000);
    };

    const role = authStorage.getRole();
    const isStudentTwinDock = !hasMinRole(role || 'STUDENT', 'STAFF');

    useEffect(() => {
        let buffer = '';
        let lastKeyTime = Date.now();

        const handleKeyDown = (e: KeyboardEvent) => {
            if (scannerLockRef.current) return; // 💥 只有网络请求时才拦截，弹窗展示时绝不拦截！

            const activeTag = document.activeElement?.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
                const activeId = document.activeElement?.id;
                if (activeId !== 'debug-scanner-input') return;
            }

            const now = Date.now();
            if (now - lastKeyTime > 50) buffer = '';
            lastKeyTime = now;

            if (e.key === 'Enter') {
                if (buffer.length > 2) {
                    e.preventDefault();
                    setIsScannerOpen(true);
                    setInputValue(buffer);
                    handleScanAction(buffer);
                    buffer = '';
                }
            } else if (typeof e.key === 'string' && e.key.length === 1) {
                buffer += e.key;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
        // handleScanAction 在 effect 之后声明，此处故意不列入 deps，避免重复绑定全局监听
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 扫码枪缓冲逻辑稳定，仅依赖 handleScanAction 闭包最新实现
    }, []);

    const handleLogout = () => {
        authStorage.clear();
        navigate('/login');
    };

    type DockLink = {
        key: string;
        name: string;
        path: string;
        icon: typeof LayoutDashboard;
        onClick?: () => void;
    };

    let links: DockLink[];
    if (isStudentTwinDock) {
        links = [
            { key: 'home', name: '主大屏', path: '/', icon: LayoutDashboard },
            { key: 'logout', name: '退出登录', path: '/_dock-logout', icon: LogOut, onClick: handleLogout },
        ];
    } else {
        links = [
            { key: 'home', name: '主大屏', path: '/', icon: LayoutDashboard },
            { key: 'debug', name: '流水线', path: '/debug', icon: ScrollText },
            { key: 'personnel', name: '档案库', path: '/debug-personnel', icon: Users },
            { key: 'ai', name: 'AI推演', path: '/debug-prediction', icon: BrainCircuit },
            { key: 'heatmap', name: '空间雷达', path: '/debug-heatmap', icon: MapIcon },
            { key: 'logout', name: '退出登录', path: '/_dock-logout', icon: LogOut, onClick: handleLogout },
        ];
        if (hasMinRole(role || 'STUDENT', 'STAFF')) {
            links.splice(3, 0, { key: 'cards', name: '房卡调度', path: '/debug-cards', icon: CreditCard });
            links.splice(5, 0, { key: 'order', name: '订单库', path: '/debug-order', icon: ShoppingCart });
        }
        if (hasMinRole(role || 'STUDENT', 'STAFF')) {
            links.push({ key: 'admin', name: '后台管理', path: '/admin', icon: Sparkles });
        }
    }

    const closeScanPopup = useCallback(() => {
        setStudentBindOpen(false);
        setActiveResult(null);
        setSwipeWarning(null);
        fv.abortFaceVerifySession();
        fv.dismissMaxRetriesPrompt();
        analyzeMutation.reset();
        executeMutation.reset();
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        setInputValue('');
        setScanPopupSession(null, null);
        cancelScheduledAutoExit();
        setAutoActionRoomId('');
        needsExitConfirmRef.current = false;
    }, [analyzeMutation, executeMutation, fv]);

    /** 收起程序坞扫码输入条并清空内容；若人脸验证进行中则一并中止 */
    const collapseScannerDock = useCallback(() => {
        if (fv.faceVerifyActive) {
            fv.abortFaceVerifySession();
        }
        setInputValue('');
        setLastScannedId('');
        lastScannedIdRef.current = '';
        clearErrorMsg();
        if (inputClearTimerRef.current) clearTimeout(inputClearTimerRef.current);
        setIsScannerOpen(false);
    }, [fv]);

    const handlePopupFaceVerifyRequest = useCallback(() => {
        if (!activeResult) return;
        fv.onFaceSuccessOverrideRef.current = (data) => {
            const uid = data.userInfo?.userId ? String(data.userInfo.userId) : '';
            if (!uid) return;
            void specialChannelLoginByFace(uid)
                .then((authData) => studentCenterSuccessRef.current?.(authData))
                .catch((e) => setAutoDismissError(e instanceof Error ? e.message : '人脸验证登录失败'));
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
        <>
            {/* 人脸验证 UI */}
            {fv.faceVerifyActive && (
                <>
                    <FaceDynamicIsland
                        status={fv.islandStatus}
                        retryAttempt={fv.retryCount}
                        failedLabel={faceVerifyFailedLabel(fv.faceStatus)}
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
                            setInputValue('');
                            setLastScannedId('');
                            toast.success('人脸照片录入成功，请重新刷卡验证');
                        }
                    }}
                    onCancel={() => {
                        fv.closeReEnroll();
                    }}
                />
            )}

            {/* PIP 监测：仅在弹窗阶段、门禁/个人中心验证结束后启动（与门禁窗互斥） */}
            <FacePipMonitor
                active={pipMonitorActive}
                userId={pipUserId}
                lostWarningSeconds={PIP_LOST_SECONDS}
                onTimeout={closeScanPopup}
                onWrongPerson={closeScanPopup}
            />

            {/* 重复刷卡全屏红色脉冲警告 — 弹窗打开后同一人再次刷卡时触发，z=820 覆盖所有子窗 */}
            <RepeatedSwipeWarningBanner message={swipeWarning} triggerKey={swipeWarningKey} />

            {!isGateFace && (
            <AnimatePresence>
                {showScanPopup && activeResult && (
                    <PopupErrorBoundary onClose={closeScanPopup}>
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
                                onClose: handlePopupFaceVerifyCancel,
                            } : undefined}
                            onClose={closeScanPopup}
                            onExecute={(payload) => runExecute(payload)}
                            isWorking={executeMutation.isPending}
                            executeData={executeMutation.data}
                            executeErrorMessage={executeErrorMessage}
                            isRefreshing={analyzeMutation.isPending}
                            onRefresh={() => {
                                if (lastScannedId) {
                                    isHardwareScanRef.current = false;
                                    analyzeMutation.mutate(lastScannedId);
                                }
                            }}
                            onExecuteReset={() => executeMutation.reset()}
                            onOpenStudentBind={() => {
                                const uid = activeResult.userInfo?.userId;
                                if (!uid) return;
                                setStudentBindTarget({
                                    userId: uid,
                                    userName: activeResult.userInfo?.name || "",
                                });
                                setStudentBindOpen(true);
                                setActiveResult(null);
                                analyzeMutation.reset();
                                executeMutation.reset();
                                if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                            }}
                            // 💥 3. 核心修复：把钢印通过 Props 传给弹窗
                            autoActionRoomId={autoActionRoomId}
                            onViolationInteractiveVerified={(patch) => {
                                setActiveResult((prev) => mergeViolationInteractiveAckIntoResult(prev, patch));
                                const cardId = lastScannedIdRef.current;
                                if (cardId && !patch.violationExpired) {
                                    isHardwareScanRef.current = false;
                                    analyzeMutation.mutate(cardId, {
                                        onSuccess: (data) =>
                                            setActiveResult(
                                                mergeViolationInteractiveAckIntoResult(data, patch) ?? data
                                            ),
                                    });
                                }
                            }}
                        />
                    </PopupErrorBoundary>
                )}
            </AnimatePresence>
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
                        setExecuteErrorMessage('');
                        setInputValue('');
                        setLastScannedId('');
                        setAutoActionRoomId('');
                        analyzeMutation.reset();
                        executeMutation.reset();
                        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                    }}
                />
            ) : null}

            {/* 核心 Dock 容器 */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center">
                <AnimatePresence>
                    {errorMsg && (
                        <motion.div
                            initial={{opacity: 0, y: 10}}
                            animate={{opacity: 1, y: 0}}
                            exit={{opacity: 0, y: 10}}
                            className="absolute -top-12 px-4 py-1.5 bg-red-500/90 backdrop-blur-md text-white text-[12px] font-bold rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.5)] border border-red-400"
                        >
                            {errorMsg}
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.div
                    layout
                    initial={{y: 50, opacity: 0}}
                    animate={{y: 0, opacity: 1}}
                    transition={{type: "spring", stiffness: 300, damping: 25}}
                    className="twin-debug-dock flex items-center gap-2 px-3 py-2.5 bg-[#18181b]/80 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-full"
                >
                    <button
                        type="button"
                        title="登录页（不退出账号）"
                        aria-label="打开登录页，保持当前登录状态"
                        onClick={() => navigate('/login')}
                        className="pr-3 mr-1 border-r border-slate-700 flex items-center justify-center bg-transparent p-0 text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181b] rounded-l-full"
                    >
                        <div
                            className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-inner">
                            <Sparkles className="w-4 h-4 text-white"/>
                        </div>
                    </button>

                    {/* 🍱 Bento 主题切换：亮色 / 暗色 / 科幻 */}
                    <ThemeSwitcher className="ml-0.5 h-9 rounded-full px-2.5 text-[11px] font-medium text-[var(--app-color-text-tertiary)] hover:bg-white/5 hover:text-[var(--app-color-text-primary)] transition-colors" />

                    {links.map((link) => {
                        const isActive = location.pathname === link.path;
                        const Icon = link.icon;
                        return (
                            <div
                                key={link.key}
                                className="relative flex items-center justify-center"
                                onMouseEnter={() => setHoveredPath(link.key)}
                                onMouseLeave={() => setHoveredPath(null)}
                            >
                                <AnimatePresence>
                                    {hoveredPath === link.key && !isScannerOpen && (
                                        <motion.div
                                            initial={{opacity: 0, y: 10, scale: 0.9}}
                                            animate={{opacity: 1, y: 0, scale: 1}}
                                            exit={{opacity: 0, y: 5, scale: 0.95}}
                                            transition={{duration: 0.15}}
                                            className="absolute -top-12 px-3 py-1.5 bg-slate-800/90 backdrop-blur-md text-white text-[11px] font-bold rounded-lg whitespace-nowrap shadow-xl border border-white/10"
                                        >
                                            {link.name}
                                            <div
                                                className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800/90"/>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <motion.button
                                    onClick={() => {
                                        if (typeof link.onClick === 'function') {
                                            link.onClick();
                                        } else {
                                            navigate(link.path);
                                        }
                                    }}
                                    whileHover={{scale: 1.15, y: -2}}
                                    whileTap={{scale: 0.95}}
                                    className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300
                                        ${isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}
                                >
                                    <Icon className="w-5 h-5"/>
                                    {isActive && <motion.div layoutId="activeDot"
                                                             className="absolute -bottom-1.5 w-1 h-1 bg-blue-500 rounded-full shadow-[0_0_8px_#3b82f6]"/>}
                                </motion.button>
                            </div>
                        );
                    })}

                    <div className="w-[1px] h-6 bg-slate-700 mx-1"/>

                    <motion.div
                        layout
                        className="flex items-center overflow-hidden"
                        initial={false}
                        animate={{width: isScannerOpen ? 220 : 40}}
                    >
                        {isScannerOpen ? (
                            <motion.div
                                initial={{opacity: 0}}
                                animate={{opacity: 1}}
                                className={`relative w-full flex items-center h-10 px-2 bg-black/40 rounded-full border shadow-[inset_0_0_10px_rgba(59,130,246,0.1)] transition-colors
                                    ${isWorking ? 'border-amber-500/50' : 'border-blue-500/30'}`}
                            >
                                <ScanFace
                                    className={`w-4 h-4 shrink-0 ml-1 transition-colors ${isWorking ? 'text-amber-400 animate-pulse' : 'text-blue-400'}`}/>
                                <input
                                    id="debug-scanner-input"
                                    autoFocus
                                    type="text"
                                    value={inputValue}
                                    onChange={(e) => {
                                        setInputValue(e.target.value);
                                        clearErrorMsg();
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleScanAction(inputValue)}
                                    placeholder={isWorking ? "系统通讯中..." : "键入 ID 或刷卡..."}
                                    className="flex-1 bg-transparent border-none outline-none text-white text-[12px] font-mono px-2 placeholder:text-slate-600 disabled:opacity-60"
                                    disabled={isWorking}
                                />
                                {isWorking ? (
                                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0 mr-1"/>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={collapseScannerDock}
                                        className="shrink-0 p-1 hover:bg-white/10 rounded-full transition-colors"
                                        title="收起并清空"
                                        aria-label="收起扫码输入并清空"
                                    >
                                        <X className="w-3.5 h-3.5 text-slate-400 hover:text-white"/>
                                    </button>
                                )}
                            </motion.div>
                        ) : (
                            <motion.button
                                onClick={() => setIsScannerOpen(true)}
                                whileHover={{scale: 1.15, y: -2}}
                                whileTap={{scale: 0.95}}
                                className="relative w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 hover:bg-white/5 text-slate-400 hover:text-white"
                            >
                                <ScanFace className="w-5 h-5"/>
                                {isWorking && <span
                                    className="absolute top-0 right-0 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-[#18181b]"></span>}
                            </motion.button>
                        )}
                    </motion.div>
                </motion.div>
            </div>

            {/* 离开确认弹窗：统一拦截所有 EXIT（高于所有弹窗） */}
            <SwipeExitConfirmDialog
                open={autoExitConfirm !== null}
                userName={activeResult?.userInfo?.name ?? ""}
                roomName={
                    (() => {
                        if (!autoExitConfirm || !activeResult?.pendingRooms) return "";
                        const room = activeResult.pendingRooms.find(
                            r => (r.officialRoomId || r.id) === autoExitConfirm.roomId
                        );
                        return room?.displayName || room?.name || autoExitConfirm.roomId || "";
                    })()
                }
                onConfirm={() => {
                    if (autoExitConfirm) {
                        doExecute(autoExitConfirm);
                    }
                    setAutoExitConfirm(null);
                }}
                onCancel={() => setAutoExitConfirm(null)}
                autoSignoutSeconds={activeResult?.autoSignoutSecondsRemaining ?? activeAutoSignoutSeconds}
                autoSignoutState={activeResult?.autoSignoutState ?? null}
                onCountdownEnd={() => {
                    setAutoExitConfirm(null);
                    if (lastScannedId) {
                        analyzeMutation.mutate(lastScannedId);
                    }
                }}
            />
        </>
    );
}