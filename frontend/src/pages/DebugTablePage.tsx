import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { fetchFilteredDebugLogs, fetchFilteredDebugStats, fetchCardMappings, syncAccessLogs, type CardMappingRow } from "@/api/twinApi";
import { Filter } from "lucide-react";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import { DebugPipelineFilterBar } from "@/features/twin-debug/DebugPipelineFilterBar";
import {
    buildDebugPipelineQueryParams,
    defaultDebugPipelineFilter,
    type DebugPipelineFilter,
} from "@/features/twin-debug/debugPipelineFilter";
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

    const [page, setPage] = useState(1);
    const pageSize = 100;
    const [isSyncing, setIsSyncing] = useState(false);

    const [filters, setFilters] = useState<DebugPipelineFilter>(() => defaultDebugPipelineFilter());
    const [keywordDraft, setKeywordDraft] = useState("");

    useEffect(() => {
        setKeywordDraft(filters.keyword);
    }, [filters.keyword]);

    const queryParams = useMemo(() => buildDebugPipelineQueryParams(filters), [filters]);

    useEffect(() => {
        setPage(1);
    }, [queryParams]);

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

    // 全量卡映射（一次性拉取 + 缓存），构建 userId → 是否豁免 的本地字典，避免逐行 N+1 搜索
    const { data: allCardMappings } = useQuery({
        queryKey: ["cardMappings", "all", "exemptDict"],
        queryFn: async (): Promise<CardMappingRow[]> => {
            const res = await fetchCardMappings(1, 100000);
            return res.list || [];
        },
        staleTime: 5 * 60 * 1000,
    });

    const exemptUserIdMap = useMemo(() => {
        const m = new Map<string, boolean>();
        for (const row of allCardMappings || []) {
            const uid = String(row.aroUserId || "").trim();
            if (!uid || m.has(uid)) continue;
            m.set(uid, toBoolFlag(row.freezeExemptFlag) || toBoolFlag((row as any).freeze_exempt_flag));
        }
        return m;
    }, [allCardMappings]);

    useEffect(() => {
        const next = new Set<string>();
        for (const log of displayData) {
            const uid = getUserKey(log);
            if (uid && exemptUserIdMap.get(uid)) next.add(uid);
        }
        setExemptUserKeySet(next);
    }, [displayData, exemptUserIdMap]);

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

    const clearFilters = () => {
        setFilters(defaultDebugPipelineFilter());
        setKeywordDraft("");
        setPage(1);
    };

    const submitKeywordSearch = useCallback(() => {
        setFilters((f) => ({ ...f, keyword: keywordDraft.trim() }));
    }, [keywordDraft]);

    return (
        <div
            data-twin-debug-pipeline
            className="box-border flex h-full flex-col overflow-y-auto bg-[var(--app-color-surface-page)] p-8"
        >

            <AdminToolbar className="mb-4 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto border-b border-[var(--app-color-border-default)] pb-4">
                <div className="min-w-0 max-w-[min(42vw,22rem)] shrink">
                    <h1 className="flex items-center gap-2 truncate text-xl font-bold text-[var(--app-color-text-primary)] sm:text-2xl sm:font-black">
                        <Filter className="h-6 w-6 shrink-0 text-indigo-500" />
                        进出流水
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-0.5 text-[10px] font-bold text-[var(--app-color-text-secondary)] sm:text-xs">
                            条数 {statsData?.totalLogs ?? 0}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 sm:text-xs">
                            进入 {statsData?.totalEnter ?? 0}
                        </span>
                    </h1>
                    <p className="truncate text-xs text-[var(--app-color-text-tertiary)] sm:text-sm">
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
                    <div className="flex shrink-0 flex-nowrap items-center gap-1 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 shadow-[var(--app-elevation-card)] sm:gap-2 sm:px-3">
                        <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="shrink-0 px-1 font-black text-[var(--app-color-accent)] disabled:text-[var(--app-color-text-tertiary)] sm:px-2">◀</button>
                        <span className="shrink-0 whitespace-nowrap text-xs font-bold text-[var(--app-color-text-secondary)] sm:text-sm">第 {page} / {totalPages || 1} 页</span>
                        <button type="button" disabled={page === totalPages || totalPages === 0} onClick={() => setPage((p) => p + 1)} className="shrink-0 px-1 font-black text-[var(--app-color-accent)] disabled:text-[var(--app-color-text-tertiary)] sm:px-2">▶</button>
                    </div>
                </AdminToolbarActions>
            </AdminToolbar>

            <DebugPipelineFilterBar
                filters={filters}
                onChange={setFilters}
                onClear={clearFilters}
                invalidateKeys={[["filteredDebugLogs"], ["filteredDebugStats"]]}
                className="mb-4 shrink-0 flex-col gap-3 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 shadow-[var(--app-elevation-card)] !items-stretch"
            />

            {/* 模块三：数据表格与分页 (保持不变) */}
            <div
                data-twin-debug-pipeline-table
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-elevation-card)]"
            >
                <div className="flex-1 overflow-auto relative">
                    <table className="w-full min-w-max text-left text-sm whitespace-nowrap border-collapse relative">
                        <thead className="bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold border-b-2 border-[var(--app-color-border-strong)] sticky top-0 z-20 shadow-sm">
                        <tr>
                            <th className="p-4">时间</th>
                            <th className="p-4">姓名</th>
                            <th className="p-4">身份 / 课题组</th>
                            <th className="p-4">动作</th>
                            <th className="p-4">位置</th>
                            <th className="p-4 min-w-[9rem] max-w-[12rem] whitespace-normal text-xs font-bold text-[var(--app-color-text-secondary)]">操作来源</th>
                            <th className="p-4 min-w-[10rem] max-w-[14rem] whitespace-normal text-xs font-bold text-amber-900">离开触发原因</th>
                            <th className="p-4 min-w-[7rem] whitespace-normal text-xs font-bold text-[var(--app-color-text-secondary)]">领卡状态</th>
                            <th className="p-4 text-rose-600">延迟还卡</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--app-color-border-default)]">
                        {isListLoading ? (
                            <tr><td colSpan={9} className="p-10 text-center font-bold text-[var(--app-color-text-tertiary)]">正在按条件极速检索引擎...</td></tr>
                        ) : displayData.length === 0 ? (
                            <tr><td colSpan={9} className="p-10 text-center font-bold text-[var(--app-color-text-tertiary)]">未找到符合当前条件的流水。</td></tr>
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
                                <tr key={log.id || index} className="hover:bg-[var(--app-color-surface-hover)] transition-colors">
                                    <td className="p-4 font-mono text-[11px] text-[var(--app-color-text-tertiary)]">{log.create_time}</td>
                                    <td className="p-4 font-bold text-[var(--app-color-text-primary)] text-base">{log.name}</td>
                                    <td className="p-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{log.user_type_names}</span>
                                            <span className="text-xs text-[var(--app-color-text-secondary)]">{log.project_group_names}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {log.accessType === 1 ? <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded text-xs border border-green-200">进入</span> :
                                            log.accessType === 2 ? <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded text-xs border border-rose-200">离开</span> :
                                                <span className="text-[var(--app-color-text-tertiary)] font-bold bg-[var(--app-color-surface-hover)] px-2 py-0.5 rounded text-xs">未知</span>}
                                    </td>
                                    <td className="p-4 font-bold text-[var(--app-color-text-secondary)] text-xs">{log.area_name} - {log.room_name}</td>
                                    <td className="p-4 align-top text-xs text-[var(--app-color-text-secondary)] max-w-[12rem] whitespace-normal break-words" title={opSrc}>{opSrc}</td>
                                    <td className="p-4 align-top text-xs text-[var(--app-color-text-secondary)] max-w-[14rem] whitespace-normal break-words">
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
                                        {keepForExit ? <span className="bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)] px-2 py-0.5 rounded font-bold text-[10px] shadow-sm">延迟还卡</span> : <span className="text-[var(--app-color-text-tertiary)]">-</span>}
                                    </td>
                                </tr>
                                    );
                                })()
                            ))
                        )}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
}