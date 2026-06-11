import {useState, useRef, useEffect} from 'react';
import {useNavigate, useLocation} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {motion, AnimatePresence} from 'framer-motion';
// 💥 加上 Map as MapIcon
import {
    LayoutDashboard, ScrollText, Users, BrainCircuit, Sparkles, ScanFace, Loader2, X, ShoppingCart, Map as MapIcon,
    LogOut, Palette
} from 'lucide-react';
import { useAnalyzeScanMutation, useExecuteAccessMutation } from '@/api/hooks/useScanner';
import type { AnalyzeResponse, RoomInfo } from '@/api/types/scanner';
import {UiverseProfilePopup} from '@/components/scanner/UiverseProfilePopup';
import { StudentDahuaBindPanel } from '@/components/scanner/StudentDahuaBindPanel';
import { PopupErrorBoundary } from '@/components/scanner/PopupErrorBoundary';
import { SwipeExitConfirmDialog } from '@/components/scanner/SwipeExitConfirmDialog';
import { fetchAccessRuleScanLinkageConfig } from '@/api/twinApi';
import {CreditCard } from 'lucide-react';
import { authStorage } from '@/features/auth/authStorage';
import { hasMinRole } from '@/features/auth/roleAccess';
import { TwinThemePickerPanel } from '@/features/twin-chrome/TwinThemePickerPanel';
import { useTwinChromeTheme } from '@/features/twin-chrome/TwinChromeThemeContext';
import type { ExecutePayload } from '@/api/types/scanner';
import {
    cancelScheduledAutoExit,
    canScheduleAutoExit,
    noteScanExecuteSuccess,
    setScanExecutePending,
    setScanPopupSession,
    tryBeginScanChannel,
} from '@/components/scanner/scanSessionGuard';

const DEBUG_NAV_RUNTIME_STAMP = "debug-nav-runtime-2026-04-16-r4";

export default function DebugNav() {
    const navigate = useNavigate();
    const location = useLocation();
    const { themeId, setThemeId } = useTwinChromeTheme();
    const [themeDockOpen, setThemeDockOpen] = useState(false);
    const themeDockWrapRef = useRef<HTMLDivElement>(null);
    const [hoveredPath, setHoveredPath] = useState<string | null>(null);

    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
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

    const [studentBindOpen, setStudentBindOpen] = useState(false);
    const [studentBindTarget, setStudentBindTarget] = useState<{ userId: string; userName: string } | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // =========================================================
    // 💥 核心修复：彻底抛弃“弹窗生命周期锁”，改为“网络级极速锁”！
    // 只要接口返回数据（弹窗展现），扫码枪瞬间释放！支持无缝连扫，后扫的人直接覆盖前一个人！
    // =========================================================
    const scannerLockRef = useRef(false);
    // 💥 新增：物理硬件锁。用于区分“扫码枪扫入”和“后台自动刷新”
    const isHardwareScanRef = useRef(false);
    // 💥 1. 新增：视觉钢印。用来告诉底下的弹窗，现在是哪个房间在全自动离开
    const [autoActionRoomId, setAutoActionRoomId] = useState<string>('');
    const hasLoggedStampRef = useRef(false);
    // 仅硬件刷卡/手动扫码/输入回车这三种方式触发的离开需确认弹窗
    const needsExitConfirmRef = useRef(false);

    useEffect(() => {
        if (hasLoggedStampRef.current) return;
        hasLoggedStampRef.current = true;
        console.info("[RuntimeStamp] DebugNav", DEBUG_NAV_RUNTIME_STAMP);
    }, []);

    useEffect(() => {
        if (!themeDockOpen) return;
        const onDown = (e: MouseEvent) => {
            const el = themeDockWrapRef.current;
            if (el && !el.contains(e.target as Node)) setThemeDockOpen(false);
        };
        document.addEventListener('mousedown', onDown, true);
        return () => document.removeEventListener('mousedown', onDown, true);
    }, [themeDockOpen]);

    const analyzeMutation = useAnalyzeScanMutation({
        onSuccess: (data) => {
            if (data && data.success === false) {
                setErrorMsg(data.message || `系统档案库中未检索到: ${lastScannedId}`);
                isHardwareScanRef.current = false;
                return; // ⛔ 阻断执行，绝不调用 setActiveResult！
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

            // 💥 终极拦截：只有真实硬件扫码 + 在馆内 + 【绝对没有被封禁】，才允许触发全自动签退！
            // 刚完成「进入」或弹窗内重复扫：canScheduleAutoExit / tryBeginScanChannel 已拦截，避免手抖连扫误离开
            if (
                data.currentState === 'INSIDE'
                && isHardwareScanRef.current
                && !isBanned
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
            setErrorMsg(error.message || '无法解析该人员');
            isHardwareScanRef.current = false;
        }
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
            // 💥 加上这行错误日志
            console.error("❌ [DebugNav - 报错了] 请求失败:", error);
            const message = error.message || '无法解析该人员';
            setErrorMsg(message);
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
        // 仅硬件刷卡/手动扫码/输入回车触发的离开受开关控制
        if (payload.action === 'EXIT' && needsExitConfirmRef.current && !swipeExitSkipConfirm) {
            setAutoExitConfirm(payload);
            return;
        }
        needsExitConfirmRef.current = false;
        doExecute(payload);
    };

    const handleScanAction = (code: string) => {
        const cleanValue = String(code).trim();
        if (!cleanValue) return;

        const guard = tryBeginScanChannel(cleanValue, activeResult?.userInfo?.userId);
        if (!guard.allow) {
            setErrorMsg(guard.message);
            isHardwareScanRef.current = false;
            return;
        }

        lastScannedIdRef.current = cleanValue;
        setLastScannedId(cleanValue);
        setErrorMsg('');
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

    const resetCloseTimer = () => {
        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = setTimeout(() => {
            setInputValue('');
            setLastScannedId('');
            setActiveResult(null);
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

    return (
        <>
            <AnimatePresence>
                {activeResult && (
                    <PopupErrorBoundary onClose={() => {
                        setStudentBindOpen(false);
                        setActiveResult(null);
                        analyzeMutation.reset();
                        executeMutation.reset();
                        if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                        setInputValue('');
                        setAutoActionRoomId('');
                    }}>
                        <UiverseProfilePopup
                            result={activeResult}
                            onClose={() => {
                                setStudentBindOpen(false);
                                setActiveResult(null);
                                analyzeMutation.reset();
                                executeMutation.reset();
                                if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
                                setInputValue('');
                                setScanPopupSession(null, null);
                                cancelScheduledAutoExit();

                                // 💥 关窗时清空视觉钢印
                                setAutoActionRoomId('');
                                needsExitConfirmRef.current = false;
                            }}
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
                        />
                    </PopupErrorBoundary>
                )}
            </AnimatePresence>
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
                    className="flex items-center gap-2 px-3 py-2.5 bg-[#18181b]/80 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-full"
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

                    <div ref={themeDockWrapRef} className="relative flex items-center justify-center" data-twin-chrome-ctx-surface>
                        <motion.button
                            type="button"
                            title="Twin 外观主题（与空白处右键菜单一致）"
                            aria-label="打开 Twin 主题选择"
                            aria-expanded={themeDockOpen}
                            onClick={() => setThemeDockOpen((v) => !v)}
                            whileHover={{ scale: 1.12, y: -2 }}
                            whileTap={{ scale: 0.95 }}
                            className="relative ml-0.5 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
                        >
                            <Palette className="h-4 w-4" aria-hidden />
                        </motion.button>
                        {themeDockOpen ? (
                            <div
                                className="absolute bottom-[calc(100%+12px)] left-1/2 z-[220] w-[13.75rem] max-w-[min(92vw,14rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-cyan-500/35 bg-slate-900 text-left shadow-2xl"
                                data-twin-chrome-ctx-surface
                                role="dialog"
                                aria-label="Twin 主题"
                            >
                                <div className="border-b border-cyan-500/25 bg-slate-950/80 px-2.5 py-1.5">
                                    <div className="text-[11px] font-semibold text-cyan-100">主题风格</div>
                                </div>
                                <TwinThemePickerPanel
                                    themeId={themeId}
                                    dense
                                    onPick={(id) => {
                                        setThemeId(id);
                                        setThemeDockOpen(false);
                                    }}
                                />
                            </div>
                        ) : null}
                    </div>

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
                                        setErrorMsg('');
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
                                        onClick={() => setIsScannerOpen(false)}
                                        className="shrink-0 p-1 hover:bg-white/10 rounded-full transition-colors"
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
                autoSignoutSeconds={activeAutoSignoutSeconds}
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