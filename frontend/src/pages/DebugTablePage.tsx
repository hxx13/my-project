import { useState, useMemo, useEffect, useCallback } from "react";
import {useQuery, useQueryClient,keepPreviousData} from "@tanstack/react-query";

import {
    addToBlacklist,
    fetchBlacklist,
    fetchFilteredDebugLogs,
    fetchFilteredDebugStats, removeFromBlacklist,
    searchCardMappings,
    syncAccessLogs
} from "@/api/twinApi";
import {
    ShieldAlert,
    Filter,
    Calendar,
    MapPin,
    Settings,
    Plus, X, Trash2
} from "lucide-react";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import {
    exitTriggerNeedsMore,
    exitTriggerReasonFull,
    exitTriggerReasonPreview,
    labelOperationSource,
} from "@/utils/accessLogFeedColumns";
import { resolveLedgerIsOwnCard } from "@/utils/cardLedgerBadges";
import { AdminToolbar, AdminToolbarActions } from "@/components/admin/AdminToolbar";

export default function DebugTablePage() {
    const toBoolFlag = (value: unknown): boolean => {
        if (value === true || value === 1) return true;
        if (typeof value === "string") {
            const s = value.trim().toLowerCase();
            return s === "1" || s === "true" || s === "yes";
        }
        return false;
    };
    const getUserKey = (log: any): string => {
        const raw =
            log?.user_id ??
            log?.userId ??
            log?.aro_user_id ??
            log?.aroUserId;
        return String(raw ?? "").trim();
    };

    const queryClient = useQueryClient(); // 用于刷新大盘数据
    const [page, setPage] = useState(1);
    const pageSize = 100;
    const [isSyncing, setIsSyncing] = useState(false);

    const [isBlacklistOpen, setIsBlacklistOpen] = useState(false);
    const [newBlacklist, setNewBlacklist] = useState({ userId: "", name: "", reason: "" });

    // 黑名单数据拉取 (只有弹窗打开时才拉取，节省性能)
    const { data: blacklistData = [], refetch: refetchBlacklist } = useQuery({
        queryKey: ["twinBlacklist"],
        queryFn: fetchBlacklist,
        enabled: isBlacklistOpen
    });

    const handleAddBlacklist = async () => {
        if (!newBlacklist.userId || !newBlacklist.name) return alert("学工号和姓名不能为空！");
        await addToBlacklist(newBlacklist);
        setNewBlacklist({ userId: "", name: "", reason: "" }); // 清空表单
        await refetchBlacklist(); // 刷新弹窗列表
        // 💥 核心：使大盘数据失效，瞬间触发重新计算！
        queryClient.invalidateQueries({ queryKey: ["filteredDebugLogs"] });
        queryClient.invalidateQueries({ queryKey: ["filteredDebugStats"] });
    };

    const handleRemoveBlacklist = async (userId: string) => {
        await removeFromBlacklist(userId);
        await refetchBlacklist();
        queryClient.invalidateQueries({ queryKey: ["filteredDebugLogs"] });
        queryClient.invalidateQueries({ queryKey: ["filteredDebugStats"] });
    };
    // =========================================================
    // 🎛️ 终极过滤引擎状态机 (加入校区与楼层级联)
    // =========================================================
    const [filters, setFilters] = useState({
        keyword: "",
        startTime: "",
        endTime: "",
        actionType: "" as "" | "1" | "2",
        campus: "",    // 💥 新增：校区 (浦东/浦西)
        floor: "",     // 💥 新增：楼层前缀 (E11A, 1, 2, 3...)
        roomName: "",  // 精确房间尾号
        excludeBlacklist: true
    });
    const [keywordDraft, setKeywordDraft] = useState(filters.keyword);
    useEffect(() => {
        setKeywordDraft(filters.keyword);
    }, [filters.keyword]);

    // 当校区改变时，如果不是浦东，自动清空楼层选择
    const handleCampusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedCampus = e.target.value;
        setFilters(f => ({
            ...f,
            campus: selectedCampus,
            floor: selectedCampus === "浦东" ? f.floor : "" // 非浦东自动清空楼层
        }));
    };

    // 组装传给后端的查询参数
    const queryParams = useMemo(() => {
        const params: any = { ...filters };
        if (params.startTime) params.startTime = params.startTime + " 00:00:00";
        if (params.endTime) params.endTime = params.endTime + " 23:59:59";
        if (!params.actionType) delete params.actionType;
        if (!params.roomName) delete params.roomName;
        if (!params.campus) delete params.campus;
        if (!params.floor) delete params.floor;
        return params;
    }, [filters]);

    // 1. 并发拉取列表数据
    const { data: listData, isLoading: isListLoading, refetch: refetchList } = useQuery({
        queryKey: ["filteredDebugLogs", page, pageSize, queryParams],
        queryFn: () => fetchFilteredDebugLogs({ ...queryParams, page, size: pageSize }),
        placeholderData: keepPreviousData,
    });

    // 2. 并发拉取统计数据
    const { data: statsData, refetch: refetchStats } = useQuery({
        queryKey: ["filteredDebugStats", queryParams],
        queryFn: () => fetchFilteredDebugStats(queryParams),
    });

    const totalPages = listData?.total ? Math.ceil(listData.total / pageSize) : 0;
    /** 避免 `listData?.data || []` 每次渲染新 [] 引用导致下游 useEffect 死循环 */
    const displayData = useMemo(() => listData?.data || [], [listData]);
    const [exemptUserKeySet, setExemptUserKeySet] = useState<Set<string>>(new Set());
    /** 流水线表：离开触发原因「更多」展开的行键 */
    const [exitTriggerExpandedKeys, setExitTriggerExpandedKeys] = useState<Set<string>>(new Set());

    useEffect(() => {
        const ids: string[] = Array.from(
            new Set(
                (displayData || [])
                    .map((log: any) => getUserKey(log))
                    .filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
            )
        );
        if (ids.length === 0) {
            setExemptUserKeySet(new Set());
            return;
        }
        let cancelled = false;
        (async () => {
            const next = new Set<string>();
            await Promise.all(ids.map(async (uid) => {
                try {
                    const rows = await searchCardMappings(uid);
                    const matched = (rows || []).find((row: any) => String(row.aroUserId || "").trim() === uid);
                    const exempt = matched
                        ? toBoolFlag(matched.freezeExemptFlag) || toBoolFlag((matched as any).freeze_exempt_flag)
                        : false;
                    if (exempt) next.add(uid);
                } catch {
                    // ignore single-user lookup failure to avoid blocking table render
                }
            }));
            if (!cancelled) setExemptUserKeySet(next);
        })();
        return () => {
            cancelled = true;
        };
    }, [displayData]);

    const handleSyncLogs = async () => {
        setIsSyncing(true);
        try {
            await syncAccessLogs();
            await refetchList();
            await refetchStats();
        } catch (error) {
            alert("❌ 同步失败，请检查网络或后端。");
        } finally {
            setIsSyncing(false);
        }
    };

    const setToday = () => {
        const today = new Date().toISOString().split('T')[0];
        setFilters(f => ({ ...f, startTime: today, endTime: today }));
    };

    const clearFilters = () => {
        setFilters({ keyword: "", startTime: "", endTime: "", actionType: "", campus: "", floor: "", roomName: "", excludeBlacklist: true });
        setKeywordDraft("");
        setPage(1);
    };

    const submitKeywordSearch = useCallback(() => {
        setFilters((f) => ({ ...f, keyword: keywordDraft.trim() }));
    }, [keywordDraft]);

    return (
        <div
            data-twin-debug-pipeline
            className="box-border flex h-full flex-col overflow-hidden bg-slate-50/50 p-8"
        >

            <AdminToolbar className="mb-4 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto border-b border-slate-200 pb-4">
                <div className="min-w-0 max-w-[min(42vw,22rem)] shrink">
                    <h1 className="flex items-center gap-2 truncate text-xl font-bold text-slate-800 sm:text-2xl sm:font-black">
                        <Filter className="h-6 w-6 shrink-0 text-indigo-500" />
                        访问流水调试
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 sm:text-xs">
                            条数 {statsData?.totalLogs ?? 0}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 sm:text-xs">
                            进入 {statsData?.totalEnter ?? 0}
                        </span>
                    </h1>
                    <p className="truncate text-xs text-slate-500 sm:text-sm">
                        数据源：过滤后的门禁流水。当前列表共 <span className="font-semibold text-indigo-600">{listData?.total || 0}</span> 条。
                    </p>
                </div>
                <AdminToolbarActions className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2">
                    <DebugDangerousOpsMenu
                        items={[
                            {
                                key: "sync-logs",
                                label: isSyncing ? "同步流水中…" : "同步门禁流水",
                                minRole: "SUPER_ADMIN",
                                disabled: isSyncing,
                                onSelect: () => {
                                    void handleSyncLogs();
                                },
                            },
                        ]}
                    />
                    <AdminToolbarSearchField
                        className="w-[min(42vw,14rem)] shrink-0 sm:w-56"
                        placeholder="搜姓名/学工号/课题组…"
                        value={keywordDraft}
                        onChange={(val) => {
                            setKeywordDraft(val);
                            if (!val.trim()) setFilters((f) => ({ ...f, keyword: "" }));
                        }}
                        onSubmit={submitKeywordSearch}
                    />
                </AdminToolbarActions>
            </AdminToolbar>

            <AdminToolbar
                data-twin-debug-pipeline-filters
                className="mb-4 shrink-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm !items-stretch"
            >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                {/* 时间区间 */}
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <Calendar className="w-4 h-4 text-slate-400 ml-2" />
                    <input type="date" value={filters.startTime} onChange={e => setFilters(f => ({ ...f, startTime: e.target.value }))} className="bg-transparent text-[13px] font-bold text-slate-700 outline-none w-[110px] cursor-pointer" />
                    <span className="text-slate-300">-</span>
                    <input type="date" value={filters.endTime} onChange={e => setFilters(f => ({ ...f, endTime: e.target.value }))} className="bg-transparent text-[13px] font-bold text-slate-700 outline-none w-[110px] cursor-pointer" />
                    <button onClick={setToday} className="text-[10px] font-black bg-white border border-slate-200 px-2 py-1 rounded text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors">今日</button>
                </div>

                <div className="h-6 w-px bg-slate-200 mx-1"></div>

                {/* 💥 动作类型筛选 */}
                <select value={filters.actionType} onChange={e => setFilters(f => ({ ...f, actionType: e.target.value as any }))} className="bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-700 rounded-lg px-2 py-2 outline-none cursor-pointer">
                    <option value="">全部动作</option>
                    <option value="1">只看进入</option>
                    <option value="2">只看离开</option>
                </select>

                <div className="h-6 w-px bg-slate-200 mx-1"></div>

                {/* 💥 级联核心 1：校区选择 */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <select value={filters.campus} onChange={handleCampusChange} className="bg-transparent text-[13px] font-bold text-slate-700 outline-none cursor-pointer">
                        <option value="">全部校区</option>
                        <option value="浦东">浦东校区</option>
                        <option value="浦西">浦西校区</option>
                    </select>
                </div>

                {/* 💥 级联核心 2：楼层/区域选择 (仅在浦东时显示) */}
                {filters.campus === "浦东" && (
                    <select value={filters.floor} onChange={e => setFilters(f => ({ ...f, floor: e.target.value }))} className="bg-indigo-50 border border-indigo-200 text-[13px] font-bold text-indigo-700 rounded-lg px-2 py-2 outline-none cursor-pointer">
                        <option value="">全部楼层</option>
                        <option value="E11A">地下室 E11A 区</option>
                        <option value="E11B">地下室 E11B 区</option>
                        <option value="地下E11C">地下室 E11C 区</option>
                        <option value="1">1F (101等)</option>
                        <option value="2">2F (201等)</option>
                        <option value="3">3F (301等)</option>
                        <option value="4">4F (401等)</option>
                    </select>
                )}

                {/* 💥 级联核心 3：精确房间号 */}
                <input type="text" placeholder="房号尾数 (如: 01A)" value={filters.roomName} onChange={e => setFilters(f => ({ ...f, roomName: e.target.value }))} className="bg-slate-50 border border-slate-200 text-[13px] font-bold text-slate-700 rounded-lg px-3 py-2 outline-none w-[130px] focus:border-indigo-400 transition-colors" />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 sm:border-t-0 sm:pt-0">
                {/* 黑名单防护开关 */}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <div className="relative">
                        <input type="checkbox" className="sr-only" checked={filters.excludeBlacklist} onChange={e => setFilters(f => ({ ...f, excludeBlacklist: e.target.checked }))} />
                        <div className={`block w-10 h-6 rounded-full transition-colors ${filters.excludeBlacklist ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
                        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${filters.excludeBlacklist ? 'transform translate-x-4' : ''}`}></div>
                    </div>
                    <span className="select-none text-xs font-bold text-slate-600">黑名单</span>
                </label>
                <button type="button" onClick={() => setIsBlacklistOpen(true)} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
                    <Settings className="h-5 w-5" />
                </button>
                <button type="button" onClick={clearFilters} className="text-xs font-bold text-slate-400 underline underline-offset-2 hover:text-rose-500">清除过滤</button>
                </div>
            </AdminToolbar>

            {/* 模块三：数据表格与分页 (保持不变) */}
            <div
                data-twin-debug-pipeline-table
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"
            >
                <div className="flex-1 overflow-auto relative">
                    <table className="w-full min-w-max text-left text-sm whitespace-nowrap border-collapse relative">
                        <thead className="bg-slate-100 text-slate-600 font-bold border-b-2 border-slate-300 sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="p-4">时间</th>
                            <th className="p-4">姓名</th>
                            <th className="p-4">身份 / 课题组</th>
                            <th className="p-4">动作</th>
                            <th className="p-4">位置</th>
                            <th className="p-4 min-w-[9rem] max-w-[12rem] whitespace-normal text-xs font-bold text-slate-700">操作来源</th>
                            <th className="p-4 min-w-[10rem] max-w-[14rem] whitespace-normal text-xs font-bold text-amber-900">离开触发原因</th>
                            <th className="p-4 min-w-[7rem] whitespace-normal text-xs font-bold text-slate-700">领卡状态</th>
                            <th className="p-4 text-rose-600">延迟还卡</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                        {isListLoading ? (
                            <tr><td colSpan={9} className="p-10 text-center font-bold text-slate-400">正在按条件极速检索引擎...</td></tr>
                        ) : displayData.length === 0 ? (
                            <tr><td colSpan={9} className="p-10 text-center font-bold text-slate-400">未找到符合当前条件的流水。</td></tr>
                        ) : (
                            displayData.map((log: any, index: number) => (
                                (() => {
                                    const isOwn = resolveLedgerIsOwnCard(log);
                                    const isKeep =
                                        toBoolFlag(log.is_keep_card) ||
                                        toBoolFlag(log.isKeepCard) ||
                                        toBoolFlag(log.freeze_exempt_flag) ||
                                        toBoolFlag(log.freezeExemptFlag);
                                    const userKey = getUserKey(log);
                                    const isExit = Number(log.accessType) === 2;
                                    const keepForExit = isKeep || (isExit && userKey && exemptUserKeySet.has(userKey));
                                    const opSrc = labelOperationSource(log);
                                    const exitPrev = exitTriggerReasonPreview(log);
                                    const exitFull = exitTriggerReasonFull(log);
                                    const exitMore = exitTriggerNeedsMore(log);
                                    const rowKey = String(log.id ?? index);
                                    const exitExpanded = exitTriggerExpandedKeys.has(rowKey);
                                    return (
                                <tr key={log.id || index} className="hover:bg-blue-50/40 transition-colors">
                                    <td className="p-4 font-mono text-[11px] text-slate-500">{log.create_time}</td>
                                    <td className="p-4 font-bold text-slate-800 text-base">{log.name}</td>
                                    <td className="p-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-slate-400">{log.user_type_names}</span>
                                            <span className="text-xs text-slate-700">{log.project_group_names}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {log.accessType === 1 ? <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded text-xs border border-green-200">进入</span> :
                                            log.accessType === 2 ? <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded text-xs border border-rose-200">离开</span> :
                                                <span className="text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded text-xs">未知</span>}
                                    </td>
                                    <td className="p-4 font-bold text-slate-700 text-xs">{log.area_name} - {log.room_name}</td>
                                    <td className="p-4 align-top text-xs text-slate-700 max-w-[12rem] whitespace-normal break-words" title={opSrc}>{opSrc}</td>
                                    <td className="p-4 align-top text-xs text-slate-600 max-w-[14rem] whitespace-normal break-words">
                                        <div className="break-words">{exitExpanded ? exitFull : exitPrev}</div>
                                        {exitMore && (
                                            <button
                                                type="button"
                                                className="mt-0.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                                                onClick={() =>
                                                    setExitTriggerExpandedKeys((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(rowKey)) next.delete(rowKey);
                                                        else next.add(rowKey);
                                                        return next;
                                                    })
                                                }
                                            >
                                                {exitExpanded ? "收起" : "更多"}
                                            </button>
                                        )}
                                    </td>
                                    <td className="p-4 align-top">
                                        <div className="flex flex-wrap items-center gap-1">
                                            {isOwn ? (
                                                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold text-[10px] border border-blue-200">自带校园卡</span>
                                            ) : (
                                                <span
                                                    className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold text-[10px] border border-emerald-200 shadow-sm"
                                                    title="领用公卡：含现场领卡，以及未走扫码建档、系统按领用公卡归类的情况"
                                                >
                                                    领用公卡
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {keepForExit ? <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold text-[10px] shadow-sm">延迟还卡</span> : <span className="text-slate-200">-</span>}
                                    </td>
                                </tr>
                                    );
                                })()
                            ))
                        )}
                        </tbody>
                    </table>
                </div>

                <div
                    data-twin-debug-pipeline-pager
                    className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                    <span className="text-xs font-bold text-slate-500">当前显示第 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, listData?.total || 0)} 条</span>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="rounded px-3 py-1 text-sm font-black text-indigo-600 transition-all hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent">◀ 上一页</button>
                        <span className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-sm">{page} / {totalPages || 1}</span>
                        <button type="button" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} className="rounded px-3 py-1 text-sm font-black text-indigo-600 transition-all hover:bg-indigo-50 disabled:opacity-30 disabled:hover:bg-transparent">下一页 ▶</button>
                    </div>
                </div>
            </div>
            {/* =========================================================
                🛡️ 黑名单管理中枢 (弹窗)
                ========================================================= */}
            {isBlacklistOpen && (
                <div
                    data-twin-debug-pipeline-modal
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-opacity"
                >
                    <div className="bg-white w-[600px] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col transform transition-all">
                        {/* 弹窗头部 */}
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                <ShieldAlert className="w-5 h-5 text-rose-500" />
                                系统风控黑名单
                            </h2>
                            <button onClick={() => setIsBlacklistOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* 添加表单区 */}
                        <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex gap-2">
                            <input type="text" placeholder="学工号/ID" value={newBlacklist.userId} onChange={e => setNewBlacklist(n => ({...n, userId: e.target.value}))} className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-indigo-400" />
                            <input type="text" placeholder="姓名" value={newBlacklist.name} onChange={e => setNewBlacklist(n => ({...n, name: e.target.value}))} className="w-[120px] text-sm px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-indigo-400" />
                            <input type="text" placeholder="屏蔽原因 (选填)" value={newBlacklist.reason} onChange={e => setNewBlacklist(n => ({...n, reason: e.target.value}))} className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 outline-none focus:border-indigo-400" />
                            <button onClick={handleAddBlacklist} className="bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-black font-bold flex items-center gap-1 text-sm shadow-sm transition-all active:scale-95">
                                <Plus className="w-4 h-4" /> 添加
                            </button>
                        </div>

                        {/* 列表区 */}
                        <div className="h-[300px] overflow-y-auto p-4">
                            {blacklistData.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">暂无黑名单数据</div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {blacklistData.map((item: any) => (
                                        <div key={item.userId} className="flex items-center justify-between p-3 rounded-xl border border-rose-100 bg-rose-50/30 hover:bg-rose-50 transition-colors group">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                                                    <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">{item.userId}</span>
                                                </div>
                                                <span className="text-xs text-slate-500 mt-1">{item.reason || "未填写原因"}</span>
                                            </div>
                                            <button onClick={() => handleRemoveBlacklist(item.userId)} className="text-rose-400 hover:text-rose-600 hover:bg-rose-100 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}