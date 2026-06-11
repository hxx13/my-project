import {
    Clipboard,
    ClipboardPaste,
    ExternalLink,
    LayoutDashboard,
    Link2,
    Moon,
    MousePointerClick,
    RefreshCw,
    Search,
    Sparkles,
    Sun,
    TextSelect,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
    adminChromeCopyPageUrl,
    adminChromeCopySelectionOrPageUrl,
    adminChromePasteIntoFocused,
    adminChromeSelectAllInContext,
} from "@/features/admin/adminChromeClipboard";
import { cn } from "@/lib/utils";
import { fitMenuAtPoint, TWIN_CHROME_MENU_Z } from "./twinChromeMenuGeometry";
import { useTheme } from "@/features/theme/ThemeProvider";

const CTX_SCROLL_NONE =
    "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden overflow-y-auto overscroll-contain";

function SectionLabel({ children }: { children: ReactNode }) {
    return <div className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}

function MenuRow({
    icon: Icon,
    label,
    onClick,
}: {
    icon: typeof Clipboard;
    label: string;
    onClick: () => void | Promise<void>;
}) {
    return (
        <button
            type="button"
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-100 hover:bg-white/10"
            onClick={() => void onClick()}
        >
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 font-medium">{label}</span>
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
    const [rootPos, setRootPos] = useState<{ left: number; top: number } | null>(null);
    const { themeId: bentoThemeId, setThemeId: setBentoThemeId, themes: bentoThemes } = useTheme();
    const navigate = useNavigate();

    /* 菜单定位：layout 阶段读取 getBoundingClientRect 后写锚点，与 AdminChromeContextMenu 同模式 */
    /* eslint-disable react-hooks/set-state-in-effect -- DOM 测距与视口贴合必须在此阶段 setState */
    useLayoutEffect(() => {
        if (!open || !payload || !rootRef.current) {
            setRootPos(null);
            return;
        }
        const rr = rootRef.current.getBoundingClientRect();
        setRootPos(fitMenuAtPoint(payload.x, payload.y, rr.width, rr.height));
    }, [open, payload]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || !payload) return null;

    const rootStylePos = rootPos ?? { left: payload.x, top: payload.y };

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
                    "fixed flex w-[13rem] max-w-[min(100vw-1rem,13rem)] flex-col overflow-hidden rounded-lg border border-slate-600 bg-slate-900 text-sm shadow-2xl",
                    "max-h-[min(100dvh-1rem,28rem)]",
                    CTX_SCROLL_NONE
                )}
                style={{ left: rootStylePos.left, top: rootStylePos.top, zIndex: TWIN_CHROME_MENU_Z.root }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
            >
                <div className="shrink-0 border-b border-white/10 px-2.5 py-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                        <MousePointerClick className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        前台快捷菜单
                    </div>
                </div>

                <div className="min-h-0 flex-1 px-1 py-1">
                    <SectionLabel>剪贴板</SectionLabel>
                    <MenuRow
                        icon={Clipboard}
                        label="复制"
                        onClick={async () => {
                            try {
                                await adminChromeCopySelectionOrPageUrl();
                                toast.success("已复制");
                                onClose();
                            } catch (e) {
                                toast.error(e instanceof Error ? e.message : "复制失败");
                            }
                        }}
                    />
                    <MenuRow
                        icon={ClipboardPaste}
                        label="粘贴"
                        onClick={async () => {
                            try {
                                await adminChromePasteIntoFocused();
                                toast.success("已粘贴");
                                onClose();
                            } catch (e) {
                                toast.error(e instanceof Error ? e.message : "粘贴失败");
                            }
                        }}
                    />
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

                    <SectionLabel>便民</SectionLabel>
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
                    <MenuRow
                        icon={RefreshCw}
                        label="刷新页面"
                        onClick={() => {
                            if (window.confirm("确认刷新当前页？")) window.location.reload();
                        }}
                    />

                    <SectionLabel>开发</SectionLabel>
                    <MenuRow
                        icon={LayoutDashboard}
                        label="仪表盘预览"
                        onClick={() => {
                            navigate("/dashboard-preview");
                            onClose();
                        }}
                    />

                    <SectionLabel>外观</SectionLabel>
                    {bentoThemes.map((t) => {
                        const Icon = t.id === 'standard' ? Sun : t.id === 'standard-dark' ? Moon : Sparkles;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                className={cn(
                                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10",
                                    bentoThemeId === t.id ? "text-cyan-300 font-semibold" : "text-slate-300"
                                )}
                                onClick={() => {
                                    setBentoThemeId(t.id);
                                    onClose();
                                }}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                                <span className="min-w-0 flex-1 font-medium">{t.label}</span>
                                {bentoThemeId === t.id ? (
                                    <span className="text-[10px] text-cyan-400">✓</span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
