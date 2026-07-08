import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { FaceCameraWindow } from "@/components/face-verify/FaceCameraWindow";
import { createPortal } from "react-dom";
import { ExpToaster } from "./ExpToaster";
import AIPredictionCard from "./AIPredictionCard";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { useProfilePopup } from "./useProfilePopup";
import { ProfileHeader } from "./components/ProfileHeader";
import { StudentEntryCard } from "./StudentEntryCard";
import { ActionButtons } from "./components/ActionButtons";
import { DisciplinaryModal } from "./components/DisciplinaryModal";
import { ScanAccessMotionOverlay } from "./ScanAccessMotionOverlay";
import { SwipeExitConfirmDialog } from "./SwipeExitConfirmDialog";
import { resolveRoomActionDensity } from "./roomActionDensity";
import { ACCESS_MOTION_CORNER_MODULE_RATIO } from "./accessMotionLoaderScale";
import type { PopupProps } from "./components/types";
import { ScanPopupNoticeCoordinator } from "./ScanPopupNoticeCoordinator";
import {
  mergeViolationInteractiveAckIntoResult,
  type ViolationInteractiveAckResult,
} from "./twinViolationInteractive";
import { ScanEntryNotice } from "./ScanEntryNotice";
import { Z_INDEX } from "@/constants/zIndex";
import { NumericKeypad } from "@/components/ui/NumericKeypad";
import { BizOverlayShell } from "./BizOverlayShell";
import type { ScanApplicantContext } from "./BizOverlayShell.types";
import { useBizRegistry } from "./useBizRegistry";
import MaterialBizPanel from "./MaterialBizPanel";
import { checkPinStatus } from "./specialChannel.api";
import { commitStudentCenterEntryFromScan } from "./studentCenterEntry";
import {
  resolveScanAccentVariant,
  SCAN_MODAL_LAYER_PROPS,
  CHART_CARD,
  SCAN_POPUP_BACKDROP,
  scanPaletteCssVars,
} from "./scanPopupTheme";
import { ScanLevelBadge } from "./ScanLevelBadge";
import { ScanPopupBackdropDecor } from "./ScanPopupBackdropDecor";
import { useTheme } from "@/features/theme/ThemeProvider";
import { useScanAssistantStore } from "@/store/useScanAssistantStore";

/** 预期核心在馆时间带 — 颜色由父级 schemeCssVars 注入的 --scan-chart-* / --scan-card-tint */
const WeeklyRoutineMatrixChart = ({ predictions }: { predictions: any[] }) => {
    const days = 7;
    const width = 300;
    const height = 60;
    const entryCurve = new Array(days).fill(0);
    const exitCurve = new Array(days).fill(0);
    if (predictions?.length) {
        const toArray = (raw: unknown, expected: number): number[] => {
            if (Array.isArray(raw)) return raw.map((v) => Number(v) || 0);
            return new Array(expected).fill(0);
        };
        let valid = 0;
        predictions.forEach((p) => {
            const wec = toArray(p?.weeklyEntryCurve, 7);
            const wxc = toArray(p?.weeklyExitCurve, 7);
            if (wec.length === 7 && wxc.length === 7 && (wec.some((v) => v > 0) || wxc.some((v) => v > 0))) {
                valid += 1;
                for (let i = 0; i < days; i += 1) {
                    entryCurve[i] += wec[i] || 0;
                    exitCurve[i] += wxc[i] || 0;
                }
            }
        });
        if (valid > 0) {
            for (let i = 0; i < days; i += 1) {
                entryCurve[i] /= valid;
                exitCurve[i] /= valid;
            }
        } else {
            entryCurve.fill(0.45);
            exitCurve.fill(0.55);
        }
    }
    const maxVal = Math.max(...entryCurve, ...exitCurve, 0.01);
    const mapY = (val: number) => height - (Math.max(0, val) / maxVal) * height;
    const getX = (idx: number) => (idx / (days - 1)) * width;
    const entryPath = entryCurve.map((v, i) => `${getX(i)},${mapY(v)}`).join(" L ");
    const exitPath = exitCurve.map((v, i) => `${getX(i)},${mapY(v)}`).join(" L ");
    return (
        <div className={`w-full ${CHART_CARD} p-4`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold tracking-wider text-[var(--app-color-text-primary)]">预期核心在馆时间带</span>
                <span className="scan-weekly-chart-badge rounded-full px-2 py-0.5 text-[9px] font-bold">
                    Time Band
                </span>
            </div>
            <div className="scan-weekly-chart-plot relative w-full pb-1 pl-8 pr-1">
                <div className="absolute left-1 top-0 text-[8px] text-[var(--app-color-text-tertiary)]">{maxVal.toFixed(2)}</div>
                <div className="absolute left-1 bottom-1 text-[8px] text-[var(--app-color-text-tertiary)]">0</div>
                <svg className="w-full h-[60px]" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                        <line key={i} x1={getX(i)} y1={0} x2={getX(i)} y2={height} stroke="var(--scan-chart-grid)" strokeDasharray="2" />
                    ))}
                    <path d={`M ${entryPath} L ${exitPath.split(" L ").reverse().join(" L ")} Z`} fill="var(--scan-chart-fill)" stroke="none" />
                    <path d={`M ${exitPath}`} fill="none" stroke="var(--scan-chart-exit)" strokeWidth="1.5" strokeDasharray="3 3" />
                    <path d={`M ${entryPath}`} fill="none" stroke="var(--scan-chart-entry)" strokeWidth="1.5" />
                </svg>
                <div className="flex justify-between w-full mt-1.5">
                    {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                        <span key={day} className="text-[9px] font-bold text-[var(--app-color-text-secondary)]">{day}</span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export function UiverseProfilePopup(props: PopupProps) {
    const { result, onClose, autoActionRoomId = "", executeErrorMessage, onOpenStudentBind, onViolationInteractiveVerified, pinAlternativeEnabled, onFaceVerifyRequest, onFaceVerifyCancel, personalCenterFace, onBindStudentCenterSuccess } = props;
    const [violationAckPatch, setViolationAckPatch] = useState<ViolationInteractiveAckResult | null>(null);

    useEffect(() => {
        setViolationAckPatch(null);
    }, [result?.userInfo?.userId]);

    const mergedResult = useMemo(() => {
        if (!result) return result;
        if (!violationAckPatch) return result;
        return mergeViolationInteractiveAckIntoResult(result, violationAckPatch) ?? result;
    }, [result, violationAckPatch]);

    const handleViolationInteractiveVerified = useCallback(
        (patch: ViolationInteractiveAckResult) => {
            setViolationAckPatch(patch);
            onViolationInteractiveVerified?.(patch);
        },
        [onViolationInteractiveVerified]
    );

    const popupProps = useMemo(
        () => ({ ...props, result: mergedResult }),
        [props, mergedResult]
    );

    const { state, actions } = useProfilePopup(popupProps);
    const canOperateRiskState = hasMinRole(authStorage.getRole(), "STAFF");
    const { theme } = useTheme();
    const isDark = theme.mode === 'dark';
    const assistantDockVisible = useScanAssistantStore((s) => s.dockVisible);
    const accentVariant = resolveScanAccentVariant(state.user?.gender);
    // ============================================================
    // 特殊通道学生入口 — 按钮显隐设计决策
    // ============================================================
    // 不做角色过滤的原因：
    //   1. AnalyzeUserInfo 字段为 snake_case（如 user_type_names），
    //      且不同人员类型的 user_type_names 取值不统一（"学生"/"在校学生"/"研究生"/…）
    //   2. 后端 PIN API（set-pin / login）第一步就是查 aro_personnel 表，
    //      不存在的人员直接返回 404。前端替后端做身份判断只是徒增 bug。
    //   3. 入口按钮只决定"是否展示按钮"，不是安全边界。
    // 因此：只要刷卡人解析出了 userId（即人员库命中），就展示两个入口按钮。
    // ============================================================
    const navigate = useNavigate();
    const [showKeypad, setShowKeypad] = useState<"set" | "verify" | null>(null);
    const [showQuickActions, setShowQuickActions] = useState(false);
    const [keypadUserId, setKeypadUserId] = useState("");
    const pendingPersonalFaceVerifyRef = useRef(false);
    const studentUserId = String(state.user?.userId || result?.userInfo?.userId || "");

    const scanApplicant = useMemo((): ScanApplicantContext | undefined => {
      const u = state.user ?? result?.userInfo;
      if (!studentUserId) return undefined;
      return {
        userId: studentUserId,
        userName: u?.name?.trim() || undefined,
        departmentName: u?.department_name?.trim() || undefined,
        projectGroupName: u?.project_group_name?.trim() || undefined,
        group: u?.group?.trim() || undefined,
      };
    }, [state.user, result?.userInfo, studentUserId]);

    /** 换人刷卡时须 remount 通告协调器，否则 autoOpen 只跑首轮、openPanels 仍挂上一人 */
    const noticeCoordinatorKey = studentUserId || "scan-notice";

    // 注册快捷业务
    const { register: registerBiz, clear: clearBiz } = useBizRegistry();
    useEffect(() => {
      registerBiz({
        id: "material-claim",
        label: "申领物品",
        icon: "📦",
        order: 1,
        component: MaterialBizPanel,
        enabled: true,
      });
      return () => clearBiz();
    }, [registerBiz, clearBiz]);

    const handleEnterStudentCenter = async () => {
      if (!studentUserId) return;
      // 人脸验证须在 PIN 键盘（含紧凑摄像头）挂载后再启动，见下方 useEffect
      if (pinAlternativeEnabled && onFaceVerifyRequest) {
        pendingPersonalFaceVerifyRef.current = true;
      }
      try {
        const hasPin = await checkPinStatus(studentUserId);
        setKeypadUserId(studentUserId);
        setShowKeypad(hasPin ? "verify" : "set");
      } catch {
        setKeypadUserId(studentUserId);
        setShowKeypad("set");
      }
    };

    // 个人中心：键盘展开后再启人脸验证，避免摄像头未挂载即 faceStart → 光速超时
    useEffect(() => {
      if (!showKeypad || !pendingPersonalFaceVerifyRef.current || !onFaceVerifyRequest) return;
      pendingPersonalFaceVerifyRef.current = false;
      onFaceVerifyRequest();
    }, [showKeypad, onFaceVerifyRequest]);

    const handleKeypadSuccess = useCallback((authData: { token: string; role: string; userInfo: unknown }) => {
      commitStudentCenterEntryFromScan(
        authData as Parameters<typeof commitStudentCenterEntryFromScan>[0],
        () => {
          setShowKeypad(null);
          onClose();
        },
        navigate,
      );
    }, [navigate, onClose]);

    useEffect(() => {
      onBindStudentCenterSuccess?.(handleKeypadSuccess);
    }, [onBindStudentCenterSuccess, handleKeypadSuccess]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (state.confirmingExitRoom) actions.cancelExit();
                else if (state.enterCelebrateRoomId) actions.dismissEnterCelebrate();
                else if (state.exitCelebrateRoomId) actions.dismissExitCelebrate();
                else if (state.showRiskModal) actions.setShowRiskModal(false);
                else onClose();
            }
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [actions, onClose, state.enterCelebrateRoomId, state.exitCelebrateRoomId, state.showRiskModal]);

    if (!result) return null;

    const showUnboundBindHint =
        Boolean(onOpenStudentBind) && result.success !== false && result.hasPhysicalCardMapping !== true;
    const motionAnchorRoomId = state.enterCelebrateRoomId || state.exitCelebrateRoomId;
    const cornerLeaveRoom =
        state.targetRooms.find(
            (r) => (r.officialRoomId || r.id) === state.enterCelebrateRoomId
        ) ?? state.targetRooms[0];
    const cornerLeaveIdx = cornerLeaveRoom ? state.targetRooms.indexOf(cornerLeaveRoom) : 0;
    const cornerLeaveLabel = cornerLeaveRoom?.displayName || cornerLeaveRoom?.name || "空间";
    /** 进入闭环落点 + 场内：点右下角动效触发离开（中央不挂 ActionButtons） */
    const showCornerLeaveHit =
        Boolean(state.enterCelebrateRoomId) &&
        !state.exitCelebrateRoomId &&
        state.enterCornerReady &&
        state.action === "EXIT" &&
        Boolean(cornerLeaveRoom);

    return createPortal(
        <div
            className={`${theme.className} ${isDark ? "dark" : ""}`}
            style={scanPaletteCssVars() as React.CSSProperties}
        >
            <ScanAccessMotionOverlay
                mode="enter"
                active={Boolean(state.enterCelebrateRoomId)}
                roomId={state.enterCelebrateRoomId}
                variant={state.accessMotionVariant}
                startAtCorner={state.enterMotionAtCorner}
                density={resolveRoomActionDensity(state.targetRooms.length)}
                themeClassName={theme.className}
                isDark={isDark}
                onCornerReady={actions.markEnterCornerReady}
                onFlyStart={actions.markEnterNoticeReady}
            />
            <ScanAccessMotionOverlay
                mode="exit"
                active={Boolean(state.exitCelebrateRoomId)}
                roomId={state.exitCelebrateRoomId}
                variant={state.accessMotionVariant}
                density={resolveRoomActionDensity(state.targetRooms.length)}
                themeClassName={theme.className}
                isDark={isDark}
                onComplete={actions.dismissExitCelebrate}
            />
            <AnimatePresence>
                <DisciplinaryModal
                    isOpen={state.showRiskModal}
                    currentState={state.globalUserState}
                    records={state.disciplinaryRecords}
                    onClose={() => actions.setShowRiskModal(false)}
                    onToggle={actions.executeToggleState}
                    showStateToggle={canOperateRiskState}
                />
            </AnimatePresence>
            <motion.div
                {...SCAN_MODAL_LAYER_PROPS}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`fixed inset-0 flex flex-col ${SCAN_POPUP_BACKDROP}`}
                style={{ zIndex: Z_INDEX.scannerPopup }}
            >
                <ScanPopupBackdropDecor />
                <button className="absolute top-16 right-16 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] shadow-[var(--app-elevation-card)] transition-colors hover:border-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)] hover:text-[var(--app-color-feedback-danger)]" onClick={onClose} title="关闭 Esc">
                    <X className="w-5 h-5" />
                </button>
                {showUnboundBindHint ? (
                    <button
                        type="button"
                        className="absolute bottom-8 left-1/2 z-[10001] -translate-x-1/2 max-w-[min(320px,90vw)] rounded-xl border border-[var(--app-color-accent)]/40 bg-[var(--app-color-accent)]/10 px-4 py-2.5 text-center text-[12px] font-bold text-[var(--app-color-text-primary)] shadow-lg hover:bg-[var(--app-color-accent)]/20 transition-colors"
                        onClick={onOpenStudentBind}
                    >
                        当前未绑卡，点我绑定卡
                    </button>
                ) : null}
                <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-hidden p-6 pb-10">
                    <div className="flex w-full max-w-[min(67.2vw,784px)] shrink-0 justify-center px-1 pt-1">
                        <ScanPopupNoticeCoordinator
                            key={noticeCoordinatorKey}
                            result={mergedResult ?? result}
                            onViolationInteractiveVerified={handleViolationInteractiveVerified}
                        />
                    </div>
                    <div className="grid min-h-0 w-full max-w-[1920px] flex-1 min-h-0 grid-cols-[25fr_50fr_25fr] gap-8 overflow-visible">
                    <div className="flex flex-col h-full min-h-0 pt-6 pb-6 gap-4">
                        <div className="w-full h-[60px] mb-1">
                            <ScanLevelBadge
                                level={state.user?.rpg?.level ?? 0}
                                exp={state.user?.rpg?.exp ?? 0}
                                nextLevelExp={state.user?.rpg?.nextLevelExp ?? 100}
                                name={state.user?.name || "未知人员"}
                            />
                        </div>
                        <div className="flex-1 min-h-0">
                            <ProfileHeader user={state.user} isAvatarLoaded={state.isAvatarLoaded} globalUserState={state.globalUserState} onAvatarError={() => actions.setAvatarLoaded(false)} onOpenRiskModal={() => actions.setShowRiskModal(true)} />
                        </div>
                        <div className="flex-1 min-h-0 flex flex-col min-h-0">
                            <StudentEntryCard
                                capacityStats={state.myCapacityStats}
                                roomOverviewFetching={state.roomOverviewFetching}
                                roomOverviewSourceCount={state.roomOverviewSourceCount}
                                studentUserId={studentUserId}
                                studentName={state.user?.name}
                                onEnterStudentCenter={handleEnterStudentCenter}
                                onOpenQuickActions={() => setShowQuickActions(true)}
                                onClosePopup={onClose}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-14">
                        <div style={{ transform: "scale(1.1)", transformOrigin: "center center" }} className="w-[500px] mb-6">
                            <WeeklyRoutineMatrixChart predictions={state.predictionList} />
                        </div>
                        <div style={{ transform: "scale(1.1)", transformOrigin: "center center" }} className="w-[500px]">
                            <AIPredictionCard predictions={state.predictionList} isLoading={state.isPredLoading} accentVariant={accentVariant} onQuickActions={() => setShowQuickActions(true)} onEnterStudentCenter={handleEnterStudentCenter} />
                        </div>
                    </div>
                    <div className="flex flex-col h-full min-h-0 pt-4 pb-6 gap-3 relative">
                        {/* 上 2/5：面包机区贴底，预留动画空间；下 3/5 给操作按钮 */}
                        <div className="flex min-h-0 flex-[2] flex-col justify-end overflow-visible rounded-2xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]/30 pb-0.5">
                            <div className="pointer-events-none flex h-[160px] w-full max-w-[300px] shrink-0 items-end justify-center self-center">
                                <ExpToaster key={state.toastData.nonce} expAdded={state.toastData.exp} play={state.toastData.play} />
                            </div>
                        </div>
                        <div className="flex min-h-0 flex-[3] flex-col overflow-visible">
                            <div className="w-full max-w-[340px] mx-auto mb-2 space-y-1 shrink-0">
                                <div className="flex gap-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1.5" title="由 twin_card_mapping 自动判定，打卡将写入流水">
                                    <div
                                        className={`flex-1 py-2 text-[11px] font-black rounded-lg text-center pointer-events-none select-none ${
                                            state.entryMode === "OWN" ? "bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)]" : "text-[var(--app-color-text-tertiary)]"
                                        }`}
                                    >
                                        💳 自带校园卡
                                    </div>
                                    <div
                                        className={`flex-1 py-2 text-[11px] font-black rounded-lg text-center pointer-events-none select-none ${
                                            state.entryMode === "BORROWED" ? "bg-[var(--app-color-feedback-danger)] text-[var(--app-color-text-inverse)]" : "text-[var(--app-color-text-tertiary)]"
                                        }`}
                                    >
                                        💳 领用公卡
                                    </div>
                                </div>
                                {result.hasPhysicalCardMapping !== undefined && (
                                    <p className="text-[10px] text-[var(--app-color-text-tertiary)] text-center leading-snug">
                                        状态已根据物理卡映射自动判定；进入时将同步至流水「卡片领用状态」
                                    </p>
                                )}
                            </div>
                            <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col" data-scan-action-module>
                                {motionAnchorRoomId ? (
                                    <div
                                        data-scan-exit-anchor={motionAnchorRoomId}
                                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                                        style={{
                                            width: `${ACCESS_MOTION_CORNER_MODULE_RATIO * 100}%`,
                                            height: `${ACCESS_MOTION_CORNER_MODULE_RATIO * 100}%`,
                                        }}
                                        aria-hidden
                                    />
                                ) : null}
                                {showCornerLeaveHit ? (
                                    <button
                                        type="button"
                                        className="absolute left-1/2 top-1/2 z-[var(--z-dropdown)] -translate-x-1/2 -translate-y-1/2 cursor-pointer opacity-0 pointer-events-auto"
                                        style={{
                                            width: `${ACCESS_MOTION_CORNER_MODULE_RATIO * 100}%`,
                                            height: `${ACCESS_MOTION_CORNER_MODULE_RATIO * 100}%`,
                                        }}
                                        aria-label={`确认离开 ${cornerLeaveLabel}`}
                                        onClick={() => actions.requestExit(cornerLeaveRoom!, cornerLeaveIdx)}
                                    />
                                ) : null}
                                {state.renderActionButtons ? (
                                    <ActionButtons
                                        key={`action-${state.action}-${state.enterCelebrateRoomId ?? "none"}`}
                                        action={state.action}
                                        targetRooms={state.targetRooms}
                                        onRoomClick={actions.handleRoomClick}
                                        isSuccess={state.isSuccess}
                                        actedRoomId={state.actedRoomId}
                                        finishedRooms={state.finishedRooms}
                                        autoActionRoomId={autoActionRoomId}
                                        getButtonText={actions.getButtonText}
                                        isEnterLocked={actions.isEnterLocked}
                                        isExitLocked={actions.isExitLocked}
                                        getKeepCardState={actions.getKeepCardState}
                                        setKeepCardState={actions.setKeepCardState}
                                        autoSignoutSecondsRemaining={state.autoSignoutSecondsRemaining}
                                        autoSignoutState={state.autoSignoutState}
                                        scanDelayEnabled={state.scanDelayEnabled}
                                        scanDelayButtonLabel={state.scanDelayButtonLabel}
                                        getDelayOptions={actions.getDelayOptionsForRoom}
                                        subjectUserId={state.user?.userId}
                                        onDelaySuccess={actions.handleDelayGrantSuccess}
                                        getDelayStatusForRoom={actions.getDelayStatusForRoom}
                                        getRejectedOptionIdsForRoom={actions.getRejectedOptionIdsForRoom}
                                        userName={state.user?.name}
                                        onRequestExit={actions.requestExit}
                                        onConfirmExit={actions.confirmExit}
                                        onCancelExit={actions.cancelExit}
                                        confirmingExitRoom={state.confirmingExitRoom}
                                        studentUserId={studentUserId}
                                    />
                                ) : (
                                    <div className="flex-1 min-h-[120px] w-full shrink-0" aria-hidden />
                                )}
                            </div>
                        </div>
                    </div>
                    </div>
                </div>

                {/* 进入确认：居中弹窗 + 倒计时 → 最小化到角落胶囊。
                    离开确认弹窗打开时完全卸载，避免两个弹窗同时出现。 */}
                {!state.confirmingExitRoom && (
                <ScanEntryNotice
                    state={state}
                    roomName={cornerLeaveLabel}
                    onDismiss={actions.dismissEnterCelebrate}
                    studentUserId={studentUserId}
                    onRequestExit={() => {
                        if (cornerLeaveRoom) {
                            actions.requestExit(cornerLeaveRoom, cornerLeaveIdx);
                        }
                    }}
                />
                )}
            </motion.div>

            {/* 离开确认弹窗（z=800，在所有扫描弹窗之上） */}
            <SwipeExitConfirmDialog
                open={state.confirmingExitRoom !== null}
                userName={state.user?.name || ""}
                roomName={state.confirmingExitRoom?.displayName || state.confirmingExitRoom?.name || "当前房间"}
                onConfirm={actions.confirmExit}
                onCancel={actions.cancelExit}
                autoSignoutSeconds={state.autoSignoutSecondsRemaining}
                autoSignoutState={state.autoSignoutState}
                onCountdownEnd={() => {
                    actions.cancelExit();
                    actions.dismissEnterCelebrate();
                }}
                studentUserId={studentUserId}
            />

            {/* Keypad overlay */}
            {showKeypad && (
                <NumericKeypad
                    mode={showKeypad}
                    userId={keypadUserId}
                    userName={state.user?.name}
                    topSlot={personalCenterFace?.active ? (
                        <FaceCameraWindow
                            embedded
                            compact
                            cameraOwner="personal"
                            cameraWarm
                            videoRef={personalCenterFace.videoRef}
                            open={personalCenterFace.open}
                            blinkPhase={personalCenterFace.blinkPhase}
                            serverVerifying={personalCenterFace.serverVerifying}
                            challengeAction={personalCenterFace.challengeAction}
                            onStreamReady={personalCenterFace.onStreamReady}
                            onStreamError={personalCenterFace.onStreamError}
                            onClose={personalCenterFace.onClose}
                        />
                    ) : undefined}
                    onSuccess={handleKeypadSuccess}
                    onCancel={() => {
                        pendingPersonalFaceVerifyRef.current = false;
                        setShowKeypad(null);
                        onFaceVerifyCancel?.();
                    }}
                />
            )}
            {/* Quick actions overlay */}
            {showQuickActions && (
                <BizOverlayShell
                    userId={studentUserId}
                    scanUser={scanApplicant}
                    title="快捷业务"
                    onCancel={() => setShowQuickActions(false)}
                />
            )}
        </div>,
        document.body
    );
}
