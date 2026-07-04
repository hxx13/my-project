import {
    ChevronRight,
    Clipboard,
    ClipboardPaste,
    Clock,
    ExternalLink,
    Home,
    LayoutDashboard,
    Link2,
    LogOut,
    Moon,
    MousePointerClick,
    RefreshCw,
    Search,
    Sparkles,
    Sun,
    TextSelect,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
    adminChromeCopyPageUrl,
    adminChromeCopySelectionOrPageUrl,
    adminChromePasteIntoFocused,
    adminChromeSelectAllInContext,
} from "@/features/admin/adminChromeClipboard";
import { authStorage } from "@/features/auth/authStorage";
import { cn } from "@/lib/utils";
import { fitMenuAtPoint, fitSubPanelNextToRoot, TWIN_CHROME_MENU_Z } from "./twinChromeMenuGeometry";
import { useTheme } from "@/features/theme/ThemeProvider";
import {
    DEFAULT_LIGHT_END,
    DEFAULT_LIGHT_START,
    formatScheduleTimeForInput,
    parseScheduleTimeFromInput,
} from "@/features/theme/themeSchedule";
import { useTwinChromeTheme } from "./TwinChromeThemeContext";
import { ThemeAnimatedSwitch } from "@/components/ui/ThemeAnimatedSwitch";
import { TwinChromeMenuSwitch } from "./TwinChromeMenuSwitch";
import { TwinThemePickerPanel } from "./TwinThemePickerPanel";
import { TWIN_THEME_MENU_ROWS } from "./twinChromeMenu.config";
import type { TwinWebChromeThemeId } from "@/api/domains/me.api";

type TwinChromeSubPanel = "schedule" | "twinTheme";

const CTX_SCROLL_NONE =
    "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-auto overscroll-contain";

const BENTO_THEME_ICONS: Record<string, typeof Sun> = {
    standard: Sun,
    "standard-dark": Moon,
    scifi: Sparkles,
};

function ScheduleTimeFields({
    lightStart,
    lightEnd,
    onCommit,
}: {
    lightStart: string;
    lightEnd: string;
    onCommit: (start: string, end: string) => void;
}) {
    const [draftStart, setDraftStart] = useState(() => formatScheduleTimeForInput(lightStart));
    const [draftEnd, setDraftEnd] = useState(() => formatScheduleTimeForInput(lightEnd));

    return (
        <div className="space-y-1 px-2 py-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">亮色时段</p>
            <div className="flex items-center gap-1">
                <input
                    type="time"
                    value={draftStart}
                    onChange={(e) => setDraftStart(e.target.value)}
                    onBlur={() => onCommit(draftStart, draftEnd)}
                    className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-[11px] text-slate-100"
                    aria-label="亮色开始时间"
                />
                <span className="text-[10px] text-slate-500">至</span>
                <input
                    type="time"
                    value={draftEnd}
                    onChange={(e) => setDraftEnd(e.target.value)}
                    onBlur={() => onCommit(draftStart, draftEnd)}
                    className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-[11px] text-slate-100"
                    aria-label="亮色结束时间"
                />
            </div>
        </div>
    );
}
function MenuDivider() {
    return <div className="my-0.5 h-px bg-white/10" role="separator" aria-hidden />;
}

function MenuRow({
    icon: Icon,
    label,
    onClick,
    danger,
}: {
    icon: typeof Clipboard;
    label: string;
    onClick: () => void | Promise<void>;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            className={cn(
                "flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-white/10",
                danger ? "text-red-300" : "text-slate-100"
            )}
            onClick={() => void onClick()}
        >
            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", danger ? "text-red-400" : "text-slate-400")} aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{label}</span>
        </button>
    );
}

/** Win11 风格顶栏：紧凑方钮 + 图标 + title 提示 */
function QuickActionButton({
    icon: Icon,
    label,
    onClick,
    danger,
}: {
    icon: typeof Sun;
    label: string;
    onClick: () => void | Promise<void>;
    danger?: boolean;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            title={label}
            aria-label={label}
            className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                "border border-white/10 bg-transparent",
                "text-slate-400",
                "transition-[color,background-color,transform] duration-150 ease-out",
                "hover:bg-white/10 hover:text-slate-200",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400/60",
                "active:scale-[0.96]",
                danger && "text-red-400 hover:bg-red-500/10 hover:text-red-300"
            )}
            onClick={() => void onClick()}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
        </button>
    );
}

export type TwinChromeContextMenuPayload = { x: number; y: number };

export function TwinChromeContextMenu({
    open,
    payload,
    onClose,
}: {
    open: boolean;
    payload: TwinChromeContextMenuPayload | null;
    onClose: () => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const scheduleRowRef = useRef<HTMLButtonElement>(null);
    const twinThemeRowRef = useRef<HTMLButtonElement>(null);
    const subRef = useRef<HTMLDivElement>(null);
    const [rootPos, setRootPos] = useState<{ left: number; top: number } | null>(null);
    const [activeSubPanel, setActiveSubPanel] = useState<TwinChromeSubPanel | null>(null);
    const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null);
    const {
        themeId: bentoThemeId,
        setThemeId: setBentoThemeId,
        themes: bentoThemes,
        effectiveMode,
        autoScheduleEnabled,
        setAutoScheduleEnabled,
        toggleLightDark,
        lightStart,
        lightEnd,
        setScheduleTimes,
    } = useTheme();
    const { themeId: twinThemeId, setThemeId: setTwinThemeId } = useTwinChromeTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const isDashPreview = location.pathname.includes("/dashboard-preview");

    /* 菜单定位：layout 阶段读取 getBoundingClientRect 后写锚点，与 AdminChromeContextMenu 同模式 */
    /* eslint-disable react-hooks/set-state-in-effect -- DOM 测距与视口贴合必须在此阶段 setState */
    useLayoutEffect(() => {
        if (!open || !payload || !rootRef.current) {
            setRootPos(null);
            setSubPos(null);
            if (!open) setActiveSubPanel(null);
            return;
        }
        const rr = rootRef.current.getBoundingClientRect();
        setRootPos(fitMenuAtPoint(payload.x, payload.y, rr.width, rr.height));

        if (!activeSubPanel) {
            setSubPos(null);
            return;
        }
        const placeSub = () => {
            const anchor =
                activeSubPanel === "schedule" ? scheduleRowRef.current : twinThemeRowRef.current;
            const subEl = subRef.current;
            if (!anchor || !subEl) return;
            const ar = anchor.getBoundingClientRect();
            const sr = subEl.getBoundingClientRect();
            setSubPos(fitSubPanelNextToRoot(ar, sr.width, sr.height));
        };
        if (subRef.current) {
            placeSub();
        } else {
            requestAnimationFrame(placeSub);
        }
    }, [open, payload, bentoThemeId, activeSubPanel, lightStart, lightEnd, autoScheduleEnabled, twinThemeId]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (activeSubPanel) {
                setActiveSubPanel(null);
                return;
            }
            onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose, activeSubPanel]);

    if (!open || !payload) return null;

    const rootStylePos = rootPos ?? { left: payload.x, top: payload.y };
    const scheduleSummaryStart = formatScheduleTimeForInput(lightStart || DEFAULT_LIGHT_START);
    const scheduleSummaryEnd = formatScheduleTimeForInput(lightEnd || DEFAULT_LIGHT_END);

    const commitScheduleTimes = (start: string, end: string) => {
        const s = parseScheduleTimeFromInput(start);
        const e = parseScheduleTimeFromInput(end);
        if (!s || !e) return;
        if (s === formatScheduleTimeForInput(lightStart) && e === formatScheduleTimeForInput(lightEnd)) return;
        setScheduleTimes(s, e);
    };

    const handleTwinThemePick = (id: TwinWebChromeThemeId) => {
        setTwinThemeId(id);
        if (id === "dashboardSciFi") {
            setBentoThemeId("scifi");
        } else if (bentoThemeId === "scifi") {
            setBentoThemeId(effectiveMode === "light" ? "standard" : "standard-dark");
        }
    };

    const handleCopy = async () => {
        try {
            await adminChromeCopySelectionOrPageUrl();
            toast.success("已复制");
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "复制失败");
        }
    };

    const handlePaste = async () => {
        try {
            await adminChromePasteIntoFocused();
            toast.success("已粘贴");
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "粘贴失败");
        }
    };

    const handleRefresh = () => {
        if (window.confirm("确认刷新当前页？")) window.location.reload();
    };

    const handleLogout = () => {
        authStorage.clear();
        toast.success("已退出登录");
        navigate("/login");
        onClose();
    };

    const themeToggleLabel = effectiveMode === "light" ? "切换为暗色" : "切换为亮色";
    const ThemeToggleIcon = effectiveMode === "light" ? Moon : Sun;
    const twinThemeLabel =
        TWIN_THEME_MENU_ROWS.find((r) => r.kind === "theme" && r.id === twinThemeId)?.label ?? "标准";

    return (
        <>
            <div
                className="fixed inset-0 cursor-default bg-transparent"
                style={{ zIndex: TWIN_CHROME_MENU_Z.backdrop }}
                aria-hidden
                onClick={onClose}
                onContextMenu={(e) => {
                    e.preventDefault();
                    onClose();
                }}
            />
            <div
                ref={rootRef}
                data-twin-chrome-ctx-surface
                role="menu"
                aria-label="Twin 快捷菜单"
                className={cn(
                    "fixed flex w-[15rem] max-w-[min(100vw-1rem,15rem)] flex-col overflow-hidden rounded-lg border border-slate-600 bg-slate-900 text-sm shadow-2xl",
                    "max-h-[min(100dvh-1rem,32rem)]",
                    CTX_SCROLL_NONE
                )}
                style={{ left: rootStylePos.left, top: rootStylePos.top, zIndex: TWIN_CHROME_MENU_Z.root }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="shrink-0 border-b border-white/10 px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                        <MousePointerClick className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        前台快捷菜单
                    </div>
                </div>

                <div
                    className="flex shrink-0 items-center justify-center gap-0.5 border-b border-white/10 px-2 py-1"
                    role="group"
                    aria-label="常用操作"
                >
                    <QuickActionButton icon={ThemeToggleIcon} label={themeToggleLabel} onClick={() => toggleLightDark()} />
                    <QuickActionButton icon={Clipboard} label="复制" onClick={handleCopy} />
                    <QuickActionButton icon={ClipboardPaste} label="粘贴" onClick={handlePaste} />
                    <QuickActionButton icon={RefreshCw} label="刷新页面" onClick={handleRefresh} />
                    <QuickActionButton icon={LogOut} label="退出登录" danger onClick={handleLogout} />
                </div>

                <div className="min-h-0 flex-1 px-1 py-0.5">
                    <MenuRow
                        icon={TextSelect}
                        label="全选"
                        onClick={() => {
                            try {
                                adminChromeSelectAllInContext();
                                toast.success("已尝试全选");
                                onClose();
                            } catch (e) {
                                toast.error(e instanceof Error ? e.message : "全选失败");
                            }
                        }}
                    />
                    <MenuRow
                        icon={Link2}
                        label="复制页面链接"
                        onClick={async () => {
                            try {
                                await adminChromeCopyPageUrl();
                                toast.success("已复制链接");
                                onClose();
                            } catch (e) {
                                toast.error(e instanceof Error ? e.message : "复制失败");
                            }
                        }}
                    />

                    <MenuDivider />
                    <MenuRow
                        icon={ExternalLink}
                        label="新标签打开当前页"
                        onClick={() => {
                            window.open(window.location.href, "_blank", "noopener,noreferrer");
                            onClose();
                        }}
                    />
                    <MenuRow
                        icon={Search}
                        label="打开命令面板"
                        onClick={() => {
                            toast("前台未接入命令面板", { icon: "ℹ️" });
                            onClose();
                        }}
                    />

                    <MenuDivider />
                    {isDashPreview ? (
                      <MenuRow
                        icon={Home}
                        label="返回仪表盘"
                        onClick={() => {
                          navigate("/console/dashboard");
                          onClose();
                        }}
                      />
                    ) : (
                      <MenuRow
                        icon={LayoutDashboard}
                        label="仪表盘预览"
                        onClick={() => {
                          navigate("/dashboard-preview");
                          onClose();
                        }}
                      />
                    )}

                    <MenuDivider />
                    <div className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs">
                        <ThemeAnimatedSwitch
                            checked={effectiveMode === "dark"}
                            onCheckedChange={(checked) => {
                                if (checked !== (effectiveMode === "dark")) toggleLightDark();
                            }}
                            aria-label={themeToggleLabel}
                            size="xs"
                        />
                        <button
                            type="button"
                            role="menuitem"
                            className="min-w-0 flex-1 rounded-md py-0.5 text-left font-medium text-slate-100 hover:text-slate-50"
                            onClick={() => toggleLightDark()}
                        >
                            {effectiveMode === "light" ? "亮色模式" : "暗色模式"}
                        </button>
                    </div>

                    <button
                        ref={scheduleRowRef}
                        type="button"
                        role="menuitem"
                        aria-expanded={activeSubPanel === "schedule"}
                        aria-haspopup="menu"
                        className={cn(
                            "flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs",
                            activeSubPanel === "schedule" ? "bg-white/10" : "hover:bg-white/10"
                        )}
                        onClick={() => setActiveSubPanel((v) => (v === "schedule" ? null : "schedule"))}
                    >
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 flex-1 leading-snug">
                            <span className="flex items-center gap-1 font-medium text-slate-100">定时自动切换</span>
                            <span className="mt-0.5 block text-[10px] text-slate-500">
                                {scheduleSummaryStart}–{scheduleSummaryEnd} 亮色
                            </span>
                        </span>
                        <ChevronRight
                            className={cn(
                                "mt-0.5 h-3.5 w-3.5 shrink-0",
                                activeSubPanel === "schedule" ? "text-cyan-300" : "text-slate-400"
                            )}
                            aria-hidden
                        />
                    </button>

                    <button
                        ref={twinThemeRowRef}
                        type="button"
                        role="menuitem"
                        aria-expanded={activeSubPanel === "twinTheme"}
                        aria-haspopup="menu"
                        className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs",
                            activeSubPanel === "twinTheme" ? "bg-white/10" : "hover:bg-white/10"
                        )}
                        onClick={() => setActiveSubPanel((v) => (v === "twinTheme" ? null : "twinTheme"))}
                    >
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                        <span className="min-w-0 flex-1 font-medium text-slate-100">Twin 霓虹</span>
                        <span className="text-[10px] text-slate-500">{twinThemeLabel}</span>
                        <ChevronRight
                            className={cn(
                                "h-3.5 w-3.5 shrink-0",
                                activeSubPanel === "twinTheme" ? "text-cyan-300" : "text-slate-400"
                            )}
                            aria-hidden
                        />
                    </button>

                    {!autoScheduleEnabled
                        ? bentoThemes.map((t) => {
                              const Icon = BENTO_THEME_ICONS[t.id] || Sun;
                              return (
                                  <button
                                      key={t.id}
                                      type="button"
                                      className={cn(
                                          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-white/10",
                                          bentoThemeId === t.id ? "font-semibold text-cyan-300" : "text-slate-300"
                                      )}
                                      onClick={() => setBentoThemeId(t.id)}
                                  >
                                      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                                      <span className="min-w-0 flex-1 font-medium">{t.label}</span>
                                      {bentoThemeId === t.id ? (
                                          <span className="text-[10px] text-cyan-400">✓</span>
                                      ) : null}
                                  </button>
                              );
                          })
                        : null}

                </div>
            </div>

            {activeSubPanel ? (
                <div
                    ref={subRef}
                    data-twin-chrome-ctx-surface
                    role="menu"
                    aria-label={activeSubPanel === "schedule" ? "定时自动切换设置" : "Twin 霓虹主题"}
                    className={cn(
                        "fixed flex w-[13.75rem] max-w-[min(100vw-1rem,13.75rem)] flex-col overflow-hidden rounded-lg border bg-slate-900 text-sm shadow-2xl",
                        activeSubPanel === "schedule" ? "border-cyan-500/35" : "border-slate-600",
                        activeSubPanel === "schedule"
                            ? "max-h-[min(100dvh-1rem,16rem)]"
                            : "max-h-[min(100dvh-1rem,14rem)]",
                        CTX_SCROLL_NONE,
                        !subPos && "pointer-events-none opacity-0"
                    )}
                    style={{
                        left: subPos?.left ?? 0,
                        top: subPos?.top ?? 0,
                        zIndex: TWIN_CHROME_MENU_Z.sub,
                        ...(subPos ? {} : { visibility: "hidden" as const }),
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {activeSubPanel === "schedule" ? (
                        <>
                            <div className="shrink-0 border-b border-cyan-500/25 bg-cyan-950/35 px-3 py-2">
                                <div className="text-xs font-semibold text-cyan-100">定时自动切换</div>
                            </div>
                            <div className="min-h-0 flex-1 px-1 py-1">
                                <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-white/10">
                                    <span id="twin-chrome-schedule-toggle-label" className="font-medium text-slate-100">
                                        启用定时切换
                                    </span>
                                    <TwinChromeMenuSwitch
                                        checked={autoScheduleEnabled}
                                        onCheckedChange={setAutoScheduleEnabled}
                                        aria-labelledby="twin-chrome-schedule-toggle-label"
                                        onClick={(event) => event.stopPropagation()}
                                    />
                                </div>
                                {autoScheduleEnabled ? (
                                    <ScheduleTimeFields
                                        key={`${scheduleSummaryStart}-${scheduleSummaryEnd}`}
                                        lightStart={lightStart}
                                        lightEnd={lightEnd}
                                        onCommit={commitScheduleTimes}
                                    />
                                ) : (
                                    <p className="px-2 py-1 text-[10px] leading-snug text-slate-500">
                                        启用后可设置每日亮色时段
                                    </p>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="shrink-0 border-b border-white/10 px-3 py-2">
                                <div className="text-xs font-semibold text-slate-100">Twin 霓虹</div>
                            </div>
                            <TwinThemePickerPanel
                                themeId={twinThemeId}
                                dense
                                onPick={(id) => {
                                    handleTwinThemePick(id);
                                }}
                            />
                        </>
                    )}
                </div>
            ) : null}
        </>
    );
}
