import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEventStore, type FeedProvenance, type UniversalEvent } from "@/store/useEventStore";
import { fetchRealtimeFeed, fetchAutomationLogsNear, type AutomationLogRow } from "@/api/twinApi";
import { PersonnelSearchDropdown } from "@/components/ui/PersonnelSearchDropdown"; // 💥 引入独立的人员预检组件
import { Info, LogIn, LogOut, Activity } from "lucide-react"; // 💥 引入 Activity 图标作为标题Icon
import { detailTextToLines } from "@/utils/detailTextToLines";
import { useDashboardSciFiVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";

function DetailParagraphs({ text, emptyLabel, sciFi }: { text: string; emptyLabel?: string; sciFi?: boolean }) {
    const trimmed = (text ?? "").trim();
    if (!trimmed) {
        return (
            <p className={`text-[13px] leading-relaxed ${sciFi ? "text-slate-400" : "text-slate-500"}`}>
                {emptyLabel ?? "暂无。"}
            </p>
        );
    }
    const lines = detailTextToLines(trimmed);
    return (
        <div className="mt-0.5 space-y-1.5">
            {lines.map((line, i) => (
                <p
                    key={i}
                    className={`whitespace-pre-wrap break-words text-[13px] leading-relaxed ${
                        sciFi ? "text-slate-200" : "text-slate-700"
                    }`}
                >
                    {line}
                </p>
            ))}
        </div>
    );
}

function feedProvenanceFromDbRow(item: Record<string, unknown>): FeedProvenance {
    const src = String(item.feed_source ?? item.feedSource ?? "").trim();
    const sum = String(item.feed_summary_zh ?? item.feedSummaryZh ?? "").trim();
    const det = String(item.feed_detail_zh ?? item.feedDetailZh ?? "").trim();
    const door = String(item.device_display_name ?? item.deviceDisplayName ?? "").trim();
    if (sum || src) {
        return {
            channel: src || "ARO_OFFICIAL",
            feedSource: src || undefined,
            summaryZh: sum || (src === "WEB_SCAN" ? "Web扫码通行" : "ARO同步"),
            detailZh: det || "进出登记说明（详见「i」溯源）。",
            doorName: door || undefined,
        };
    }
    const at = item.accessType ?? item.access_type;
    const act = at === 1 ? "进入" : at === 2 ? "离开" : at === 0 ? "在场" : "通行";
    const flags: string[] = [];
    if (Number(item.is_borrowed_card) === 1) flags.push("领用卡");
    if (Number(item.is_shared_card) === 1) flags.push("共享卡");
    if (Number(item.is_keep_card) === 1) flags.push("保管卡");
    const flagStr = flags.length ? ` · ${flags.join("·")}` : "";
        return {
            channel: "ARO_OFFICIAL",
            feedSource: "ARO_OFFICIAL",
            summaryZh: `ARO同步·${act}${flagStr}`,
            detailZh: `动作：${act}。${flags.length ? `标记：${flags.join("、")}。` : ""}`,
            doorName: door || undefined,
        };
}

const POPOVER_W = 380;
const POPOVER_MAX_H = 480;

function ProvenancePopover(props: {
    evt: UniversalEvent;
    anchorRect: DOMRect;
    onClose: () => void;
}) {
    const { evt, anchorRect, onClose } = props;
    const prov = evt.feedProvenance;
    const uid = evt.person?.userId?.trim();
    const [near, setNear] = useState<AutomationLogRow[] | null>(null);
    const [nearLoading, setNearLoading] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        if (!uid || !evt.timestamp) {
            // 无锚点时不发起请求；清空列表（与数据拉取分支对称）
            // eslint-disable-next-line react-hooks/set-state-in-effect -- 同步清空依赖项变化时的列表
            setNear([]);
            return;
        }
        let cancelled = false;
        setNearLoading(true);
        void fetchAutomationLogsNear({
            userId: uid,
            anchorTime: evt.timestamp,
            windowMinutes: 30,
            limit: 10,
        })
            .then((rows) => {
                if (!cancelled) setNear(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancelled) setNear([]);
            })
            .finally(() => {
                if (!cancelled) setNearLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [uid, evt.timestamp]);

    let top = anchorRect.bottom + 6;
    let left = anchorRect.right - POPOVER_W;
    if (left < 8) left = 8;
    if (left + POPOVER_W > window.innerWidth - 8) left = window.innerWidth - POPOVER_W - 8;
    if (top + POPOVER_MAX_H > window.innerHeight - 8) {
        top = Math.max(8, anchorRect.top - POPOVER_MAX_H - 6);
    }

    const od = evt.originalData;
    const hasFeedProv =
        Boolean((prov?.summaryZh ?? "").trim()) ||
        Boolean((prov?.detailZh ?? "").trim()) ||
        Boolean((prov?.doorName ?? "").trim());
    const sf = useDashboardSciFiVisual();

    return createPortal(
        <>
            <button
                type="button"
                className="fixed inset-0 z-[5600] cursor-default bg-transparent"
                aria-label="关闭溯源"
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                className={`fixed z-[5601] flex max-h-[min(86vh,520px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border text-left shadow-2xl ${
                    sf
                        ? "border-cyan-500/35 bg-slate-950/95 shadow-[0_0_40px_rgba(56,189,248,0.2)]"
                        : "border-slate-200 bg-white"
                }`}
                style={{ top, left, width: POPOVER_W, maxHeight: POPOVER_MAX_H }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className={`shrink-0 border-b px-3 py-2 ${
                        sf ? "border-cyan-500/25 bg-slate-900/90" : "border-slate-100 bg-slate-50/90"
                    }`}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-semibold ${sf ? "text-cyan-100" : "text-slate-800"}`}>进出溯源</span>
                        <button
                            type="button"
                            className={`rounded border px-2 py-0.5 text-xs ${
                                sf
                                    ? "border-cyan-500/40 bg-slate-900 text-cyan-200 hover:bg-slate-800"
                                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                            }`}
                            onClick={onClose}
                        >
                            关闭
                        </button>
                    </div>
                    <p className={`mt-1 text-[11px] ${sf ? "text-slate-400" : "text-slate-500"}`}>
                        人员：{evt.person?.name || "未知"}
                        {uid ? ` · userId=${uid}` : ""}
                    </p>
                </div>
                <div className={`min-h-0 flex-1 overflow-y-auto px-3 py-2 text-xs space-y-3 ${sf ? "text-slate-200" : "text-slate-700"}`}>
                    <section>
                        <div className={`text-[10px] font-bold uppercase tracking-wide ${sf ? "text-cyan-400/90" : "text-slate-400"}`}>
                            事件与位置
                        </div>
                        <p className="mt-0.5">
                            动作：{evt.action === "ENTER" ? "进入" : evt.action === "EXIT" ? "离开" : evt.action} · 时间 {evt.timestamp || "—"}
                        </p>
                        <p>
                            校区 {evt.location?.campus || "—"} · 楼层 {evt.location?.floor || "—"} · 房间 {evt.location?.room || "—"}
                        </p>
                        {od?.message && (
                            <p className={sf ? "text-slate-400" : "text-slate-500"}>
                                原始状态：{od.rawStatusCode ?? "—"} — {od.message}
                            </p>
                        )}
                    </section>

                    {hasFeedProv && (
                        <>
                            <section>
                                <div className={`text-[10px] font-bold uppercase tracking-wide ${sf ? "text-cyan-400/90" : "text-slate-400"}`}>
                                    数据来源与设备
                                </div>
                                {prov?.summaryZh ? (
                                    <div className={`mt-0.5 font-medium ${sf ? "text-slate-100" : "text-slate-800"}`}>
                                        <DetailParagraphs text={prov.summaryZh} sciFi={sf} />
                                    </div>
                                ) : null}
                                {prov?.doorName && (
                                    <p className={`mt-1 ${sf ? "text-slate-400" : "text-slate-600"}`}>门禁/设备：{prov.doorName}</p>
                                )}
                                {prov?.ruleHint && <p className="text-amber-800">{prov.ruleHint}</p>}
                            </section>
                            <section>
                                <div className={`text-[10px] font-bold uppercase tracking-wide ${sf ? "text-cyan-400/90" : "text-slate-400"}`}>
                                    详情说明
                                </div>
                                <DetailParagraphs text={prov?.detailZh ?? ""} emptyLabel="暂无详情说明。" sciFi={sf} />
                            </section>
                        </>
                    )}

                    <section
                        className={`rounded-lg border p-2 ${
                            sf ? "border-cyan-500/25 bg-slate-900/60" : "border-indigo-100 bg-indigo-50/40"
                        }`}
                    >
                        <div className={`text-[10px] font-bold uppercase tracking-wide ${sf ? "text-cyan-300" : "text-indigo-600"}`}>
                            自动化日志
                        </div>
                        {!uid && (
                            <p className={`mt-1 ${sf ? "text-amber-300" : "text-amber-800"}`}>本条流水缺少 userId，无法关联自动化日志。</p>
                        )}
                        {uid && nearLoading && <p className={`mt-1 ${sf ? "text-slate-400" : "text-slate-500"}`}>加载中…</p>}
                        {uid && !nearLoading && near && near.length === 0 && (
                            <p className={`mt-1 ${sf ? "text-slate-400" : "text-slate-500"}`}>该时间窗内无关联自动化记录。</p>
                        )}
                        {uid && !nearLoading && near && near.length > 0 && (
                            <ul className={`mt-2 max-h-40 space-y-2 overflow-y-auto border-t pt-2 ${sf ? "border-cyan-500/20" : "border-indigo-100/80"}`}>
                                {near.map((r) => (
                                    <li
                                        key={r.id}
                                        className={`rounded border p-1.5 text-[11px] shadow-sm ${
                                            sf
                                                ? "border-cyan-500/20 bg-slate-950/80"
                                                : "border-white/80 bg-white/90"
                                        }`}
                                    >
                                        <div className={`font-semibold ${sf ? "text-slate-100" : "text-slate-800"}`}>
                                            {r.eventTime || "—"} · {r.automationTypeLabel || r.automationType || "—"}
                                        </div>
                                        <p className={`mt-0.5 font-medium ${sf ? "text-slate-300" : "text-slate-700"}`}>
                                            原因：{r.triggerReasonLabel || r.triggerReason || "—"}
                                        </p>
                                        <p className={`mt-0.5 ${sf ? "text-slate-400" : "text-slate-500"}`}>
                                            动作：{r.eventKeyLabel || r.eventKey || "—"} · 触发：{r.triggerTypeLabel || r.triggerType || "—"} ·{" "}
                                            {r.success === 1 ? <span className="text-emerald-600">成功</span> : <span className="text-rose-600">失败</span>}
                                        </p>
                                        {(r.detailDisplayZh || r.detail) && (
                                            <div
                                                className={`mt-1 space-y-1 border-t pt-1 ${sf ? "border-cyan-500/15 text-slate-400" : "border-indigo-100/80 text-slate-600"}`}
                                            >
                                                {detailTextToLines(String(r.detailDisplayZh || r.detail)).map((line, i) => (
                                                    <p key={i} className="whitespace-pre-wrap break-words leading-relaxed">
                                                        {line}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </>,
        document.body
    );
}

export function TimelineWaterfall() {
    const events = useEventStore((state) => state.realtimeEvents);
    const setEvents = useEventStore((state) => state.setEvents);
    const [provOpen, setProvOpen] = useState<{ evt: UniversalEvent; rect: DOMRect } | null>(null);
    const sf = useDashboardSciFiVisual();
    /** 学生首页仅浏览流水；人员预检与单条「溯源详情」仅员工及以上 */
    const showStaffFeedTools = hasMinRole(authStorage.getRole() || "STUDENT", "STAFF");

    const openProvenance = useCallback((evt: UniversalEvent, el: HTMLElement | null) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setProvOpen({ evt, rect });
    }, []);

    // 开机拉取
    useEffect(() => {
        const loadInitialFeed = async () => {
            try {
                const dbLogs = await fetchRealtimeFeed(50);
                const safeDbLogs = Array.isArray(dbLogs) ? dbLogs : [];
                const formattedLogs: UniversalEvent[] = safeDbLogs.map((item: Record<string, unknown>) => {
                    const rawId = item.id ?? item.eventId ?? "";
                    const eventId = typeof rawId === "string" ? rawId : String(rawId);
                    const rawTs = item.create_time ?? item.timestamp ?? "";
                    const timestamp = typeof rawTs === "string" ? rawTs : String(rawTs);
                    const nameRaw = item.name ?? "未知";
                    const roleRaw = item.user_type_names ?? "UNKNOWN";
                    const groupRaw = item.project_group_names ?? "未知课题组";
                    return {
                        action: ((item.accessType === 1 || item.access_type === 1) ? "ENTER" : "EXIT") as UniversalEvent["action"],
                        eventId,
                        source: "DB",
                        category: "ACCESS",
                        timestamp,
                        person: {
                            name: typeof nameRaw === "string" ? nameRaw : String(nameRaw),
                            role: typeof roleRaw === "string" ? roleRaw : String(roleRaw),
                            group: typeof groupRaw === "string" ? groupRaw : String(groupRaw),
                            userId: String(item.user_id ?? item.userId ?? "").trim() || undefined,
                        },
                        location: {
                            campus: String(item.area_name ?? ""),
                            floor: String(item.floor_name ?? ""),
                            room: String(item.room_name ?? ""),
                            roomId: String(item.room_id ?? item.roomId ?? "").trim() || undefined,
                        },
                        feedProvenance: feedProvenanceFromDbRow(item),
                    };
                });

                setEvents(formattedLogs);
            } catch (error) {
                console.error("❌ 初始流水拉取失败:", error);
            }
        };
        loadInitialFeed();
    }, [setEvents]);

    return (
        <div className="w-full h-full flex flex-col">
            {provOpen && (
                <ProvenancePopover evt={provOpen.evt} anchorRect={provOpen.rect} onClose={() => setProvOpen(null)} />
            )}
            {/* 💥 全新标题头部：渐变徽章图标 + 渐变追踪字体 */}
            <div
                className={`shrink-0 flex justify-between items-center border-b pb-3 mb-3 relative ${
                    sf ? "border-cyan-500/25" : "border-slate-200/60"
                }`}
            >
                <div className="flex items-center gap-2">
                    <div
                        className={`w-6 h-6 rounded-md flex items-center justify-center shadow-md ${
                            sf
                                ? "bg-gradient-to-br from-cyan-500 to-fuchsia-600 shadow-cyan-500/40"
                                : "bg-gradient-to-br from-blue-500 to-indigo-500 shadow-blue-500/20"
                        }`}
                    >
                        <Activity className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span
                        className={`text-[15px] font-extrabold tracking-wider font-sans ${
                            sf
                                ? "bg-clip-text text-transparent bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 drop-shadow-[0_0_14px_rgba(34,211,238,0.35)]"
                                : "bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500"
                        }`}
                    >
                        实时进出记录链路
                    </span>
                </div>

                {showStaffFeedTools ? (
                    <div className="relative w-[40px] h-[40px] shrink-0 z-[100] mr-1">
                        <PersonnelSearchDropdown />
                    </div>
                ) : (
                    <div className="w-[40px] shrink-0 mr-1" aria-hidden />
                )}
            </div>

            {/* 瀑布流不再受搜索干扰，永远展示最新的进出动态 */}
            <div className="flex-1 w-full overflow-y-auto pr-1 pb-4 [&::-webkit-scrollbar]:hidden">
                <AnimatePresence initial={false}>
                    {events.map((evt: UniversalEvent) => {
                        const isEnter = evt.action === "ENTER";
                        const isBootRecord = evt.source === "DB";

                        const timeStr = evt.timestamp ? evt.timestamp.split(" ")[1].substring(0, 5) : "--:--";

                        // 💥 新增：将时间拆分为小时和分钟，供给“遥测胶囊”使用
                        const [hour, minute] = timeStr.split(":");

                        return (
                            <motion.div
                                key={evt.eventId}
                                layout
                                initial={isBootRecord ? false : { opacity: 0, y: -20, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                // 💥 修复 1：把 items-center 换成 items-stretch！让时间、中轴线、右侧卡片高度强制一致！
                                className="flex items-stretch mb-3 relative group pl-2 pr-1"
                            >
                                {/* =======================================
                                    ⏱️ 时间胶囊：绝对居中
                                    ======================================= */}
                                {/* 💥 修复 2：去掉 pt-2，加入 items-center justify-center 保证绝对垂直居中 */}
                                <div className="w-[52px] shrink-0 flex flex-col justify-center items-end pr-1">
                                    <div
                                        className={`flex items-center shadow-sm rounded-[4px] overflow-hidden border group-hover:shadow-md group-hover:scale-105 transition-all duration-300 ${
                                            sf ? "border-cyan-500/35" : "border-slate-200/60"
                                        }`}
                                    >
                                        <span
                                            className={`backdrop-blur-md text-[10px] font-black px-1.5 py-[2px] leading-none
                                            ${isEnter ? (sf ? "bg-cyan-500/30 text-cyan-100" : "bg-cyan-100 text-cyan-800") : sf ? "bg-rose-500/25 text-rose-100" : "bg-rose-100 text-rose-800"}`}
                                        >
                                            {hour}
                                        </span>
                                        <span
                                            className={`backdrop-blur-md text-[10px] font-black px-1.5 py-[2px] leading-none ${
                                                sf ? "bg-slate-900/90 text-slate-300" : "bg-white text-slate-500"
                                            }`}
                                        >
                                            {minute}
                                        </span>
                                    </div>
                                </div>

                                {/* =======================================
                                    🌟 枢纽中轴线：融合 方案1(徽章) + 方案2(光轨)
                                    ======================================= */}
                                <div className="relative w-[36px] flex justify-center mx-2 shrink-0">

                                    <div
                                        className={`absolute top-0 bottom-[-16px] left-[50%] -translate-x-[50%] w-[2px] z-0 ${
                                            sf ? "bg-cyan-500/25" : "bg-slate-200/60"
                                        }`}
                                    >
                                    </div>

                                    <div
                                        className={`absolute top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%] z-10 w-7 h-7 rounded-full flex items-center justify-center border-[2px] shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md ${
                                            sf ? "border-slate-900 shadow-cyan-500/30" : "border-white"
                                        } ${
                                            isEnter
                                                ? "bg-gradient-to-br from-blue-500 to-cyan-400 shadow-blue-400/30"
                                                : "bg-gradient-to-br from-orange-400 to-rose-400 shadow-orange-400/30"
                                        }`}
                                    >
                                        {isEnter ? (
                                            <LogIn className="w-3.5 h-3.5 text-white ml-0.5" strokeWidth={3} />
                                        ) : (
                                            <LogOut className="w-3.5 h-3.5 text-white mr-0.5" strokeWidth={3} />
                                        )}
                                    </div>
                                </div>

                                {/* =======================================
                                    🍎 单行极致压缩版：侧边光晕 + 动态幻彩标签
                                    ======================================= */}
                                <div
                                    className={`flex-1 min-w-0 relative border rounded-[12px] p-2 flex items-center gap-1.5 group-hover:-translate-y-0.5 transition-all overflow-hidden cursor-default ${
                                        isEnter
                                            ? sf
                                                ? "bg-cyan-950/35 border-cyan-500/25 shadow-[0_0_24px_rgba(34,211,238,0.12)] group-hover:bg-cyan-950/50 group-hover:shadow-[0_0_28px_rgba(34,211,238,0.2)]"
                                                : "bg-blue-50/40 border-blue-100/50 shadow-[0_2px_10px_rgba(59,130,246,0.03)] group-hover:bg-blue-50/70 group-hover:shadow-[0_6px_20px_rgba(59,130,246,0.08)]"
                                            : sf
                                              ? "bg-rose-950/30 border-rose-500/25 shadow-[0_0_24px_rgba(244,63,94,0.12)] group-hover:bg-rose-950/45 group-hover:shadow-[0_0_28px_rgba(244,63,94,0.18)]"
                                              : "bg-orange-50/40 border-orange-100/50 shadow-[0_2px_10px_rgba(249,115,22,0.03)] group-hover:bg-orange-50/70 group-hover:shadow-[0_6px_20px_rgba(249,115,22,0.08)]"
                                    }`}
                                >
                                    {/* ✨ 侧边魔法光晕 */}
                                    <div className={`absolute inset-y-0 left-0 w-12 bg-gradient-to-r to-transparent opacity-40 pointer-events-none
                                        ${isEnter ? 'from-blue-300/40' : 'from-orange-300/40'}`}
                                    />

                                    {/* ✨ 侧边极细发光灯带 (3px 缩小为 2.5px 适应单行) */}
                                    <div className={`absolute inset-y-0 left-0 w-[2.5px] 
                                        ${isEnter ? 'bg-gradient-to-b from-blue-400 to-cyan-300' : 'bg-gradient-to-b from-orange-400 to-rose-300'}`}
                                    />

                                    {/* 姓名 */}
                                    <span
                                        className={`relative z-10 font-black text-[13px] tracking-wide shrink-0 ${
                                            sf ? "text-slate-100" : "text-slate-800"
                                        }`}
                                    >
                                        {evt.person?.name || "未知"}
                                    </span>

                                    {/* 📍 地点标签：替换为机械探雷鼠 SVG，自动继承 Cyan/Amber 幻彩配色 */}
                                    {evt.location?.room && (
                                        <span className={`relative z-10 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap overflow-hidden text-ellipsis flex-shrink border
                                            ${isEnter ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-700' : 'bg-amber-500/10 border-amber-500/20 text-amber-700'}`}>

                                            {/* 机械探雷鼠 SVG (已优化尺寸与对齐) */}
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                 strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                                                 className="w-3.5 h-3.5 shrink-0"
                                                 style={{ filter: "drop-shadow(0 0 2px currentColor)" } as CSSProperties}
                                            >
                                                {/* 1. 电子尾巴：流畅的S型数据线 */}
                                                <path d="M4 14c-4 0-4 6 1 6h2" />
                                                {/* 2. 机械躯干：圆润后背 + 几何切割的尖吻头部 */}
                                                <path d="M6 16h9l4-2l-2-3h-3l-2-2H8a4 4 0 0 0-4 4v3z" />
                                                {/* 3. 雷达接收器（圆耳朵） */}
                                                <circle cx="13" cy="9" r="2" />
                                                {/* 4. 光学传感器（发光眼睛） */}
                                                <circle cx="16.5" cy="12.5" r="0.5" fill="currentColor" stroke="none" />
                                                {/* 5. 探雷天线（机械胡须） */}
                                                <path d="M19 13.5l3-1.5" />
                                                <path d="M19 14.5l3 1.5" />
                                            </svg>

                                            <span>{evt.location.campus} {evt.location.room}</span>
                                        </span>
                                    )}

                                    {/* 🧬 课题组标签：动态幻彩配色 (进：靛蓝 / 出：玫瑰粉) */}
                                    {evt.person?.group && (
                                        <span className={`relative z-10 text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap overflow-hidden text-ellipsis flex-shrink border
                                            ${isEnter ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700' : 'bg-rose-500/10 border-rose-500/20 text-rose-700'}`}
                                        >
                                            🧬 {evt.person.group}
                                        </span>
                                    )}

                                    {showStaffFeedTools ? (
                                        <button
                                            type="button"
                                            className={`relative z-10 ml-auto shrink-0 rounded-full p-1 transition-colors ${
                                                sf
                                                    ? "text-cyan-400/80 hover:bg-cyan-500/15 hover:text-cyan-200"
                                                    : "text-slate-400 hover:bg-slate-200/80 hover:text-slate-700"
                                            }`}
                                            title="溯源详情（锚点弹窗）"
                                            aria-label="溯源详情"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openProvenance(evt, e.currentTarget);
                                            }}
                                        >
                                            <Info className="h-3.5 w-3.5" />
                                        </button>
                                    ) : null}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}
