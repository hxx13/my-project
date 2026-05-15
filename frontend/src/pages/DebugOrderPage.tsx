import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchGroupOrderDetailData, syncAnimalOrders, cancelAnimalOrderSync } from "@/api/twinApi";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { AdminToolbar, AdminToolbarActions } from "@/components/admin/AdminToolbar";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import { Crown, Mouse, Search } from "lucide-react";

type GroupOrderSummary = {
    projectName?: string;
    piName?: string;
    monthQty?: number;
    totalQty?: number;
    maleQty?: number;
    femaleQty?: number;
};

type GroupOrderResponse = {
    total: number;
    row1Summary: GroupOrderSummary | null;
    detailLogs: Array<Record<string, any>>;
};

export default function DebugOrderPage() {
    const [page, setPage] = useState(1);
    const [isSyncing, setIsSyncing] = useState(false);
    const orderSyncAbortRef = useRef<AbortController | null>(null);

    const [isSearching, setIsSearching] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [searchDraft, setSearchDraft] = useState("");

    useEffect(() => {
        setSearchDraft(keyword);
    }, [keyword]);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["groupOrderDetail", page, keyword],
        queryFn: async (): Promise<GroupOrderResponse> => {
            const raw = await fetchGroupOrderDetailData(page, keyword) as any;
            return {
                total: Number(raw?.total ?? 0),
                row1Summary: (raw?.row1Summary ?? null) as GroupOrderSummary | null,
                detailLogs: Array.isArray(raw?.detailLogs) ? raw.detailLogs : [],
            };
        },
    });

    const totalGroups = data?.total || 0;
    const summary = data?.row1Summary || null;
    const detailLogs = data?.detailLogs || [];

    const handleSearch = () => {
        const t = searchDraft.trim();
        setKeyword(t);
        setPage(1);
        setIsSearching(!!t);
    };

    const clearOrderSearch = () => {
        setSearchDraft("");
        setKeyword("");
        setPage(1);
        setIsSearching(false);
    };

    const handleSyncOrders = async () => {
        if (isSyncing) {
            try {
                await cancelAnimalOrderSync();
            } catch {
                /* ignore */
            }
            orderSyncAbortRef.current?.abort();
            orderSyncAbortRef.current = null;
            setIsSyncing(false);
            return;
        }
        const ac = new AbortController();
        orderSyncAbortRef.current = ac;
        setIsSyncing(true);
        try {
            await syncAnimalOrders(ac.signal);
            alert("✅ 订单同步已完成（若中途暂停则可能未全量）。");
            await refetch();
        } catch (error: unknown) {
            const err = error as { name?: string; code?: string };
            if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
                /* 用户暂停 */
            } else {
                alert("❌ 同步失败，请检查网络或后端。");
            }
        } finally {
            orderSyncAbortRef.current = null;
            setIsSyncing(false);
        }
    };

    if (isLoading && !isSearching)
        return (
            <div data-twin-debug-orders className="p-10 text-xl font-bold text-slate-500">
                正在聚合全局订购画像...
            </div>
        );
    if (error)
        return (
            <div data-twin-debug-orders className="p-10 text-xl font-bold text-red-500">
                读取数据崩溃！请检查后端。
            </div>
        );

    return (
        <div data-twin-debug-orders className="relative box-border flex h-full flex-col bg-slate-50 p-8">

            <AdminToolbar className="mb-6 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto pb-1 sm:gap-4">
                <div className="min-w-0 max-w-[min(40vw,22rem)] shrink">
                    <h1 className="flex items-center gap-2 truncate text-xl font-black text-slate-800 sm:text-2xl">
                        <Mouse className="h-7 w-7 shrink-0 text-blue-600" /> 订购流水调试
                    </h1>
                    <p className="truncate text-xs text-slate-500 sm:text-sm">数据来源：<code className="rounded bg-slate-100 px-1">aro_animal_order</code>。同步会拉取官方订单，耗时较长。</p>
                </div>
                <AdminToolbarActions className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2">
                    <DebugDangerousOpsMenu
                        items={[
                            {
                                key: "sync-orders",
                                label: isSyncing ? "暂停同步订单" : "同步订单（官方）",
                                minRole: "SUPER_ADMIN",
                                onSelect: () => {
                                    void handleSyncOrders();
                                },
                            },
                        ]}
                    />
                    <AdminToolbarSearchField
                        className="w-[min(42vw,14rem)] shrink-0 sm:w-56"
                        placeholder="搜 PI 或 课题组…"
                        value={searchDraft}
                        onChange={(val) => {
                            setSearchDraft(val);
                            if (!val.trim()) clearOrderSearch();
                        }}
                        onSubmit={handleSearch}
                    />
                    <div className="flex shrink-0 flex-nowrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm sm:gap-2 sm:px-4 sm:py-1.5">
                        <button type="button" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="text-lg font-black text-blue-600 disabled:text-slate-300">◀</button>
                        <span className="whitespace-nowrap text-sm font-bold text-slate-700 sm:text-base">第 {page} / {totalGroups || 1} 组</span>
                        <button type="button" disabled={page === totalGroups || totalGroups === 0} onClick={() => setPage(p => p + 1)} className="text-lg font-black text-blue-600 disabled:text-slate-300">▶</button>
                    </div>
                </AdminToolbarActions>
            </AdminToolbar>

            {/* 表格容器 */}
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-auto relative pb-24">

                {summary ? (
                    <table className="w-max min-w-full text-left text-base whitespace-nowrap border-collapse">
                        {/* 💥 优化 1：压缩表头垂直高度 (py-3代替py-5)，字号提升 (text-base) */}
                        <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 sticky top-0 z-30 text-base">
                        <tr>
                            <th className="px-4 py-3 sticky left-0 top-0 bg-slate-100 z-40 shadow-[1px_0_0_#cbd5e1] text-center w-[120px]">订单编号 (SN)</th>
                            <th className="px-4 py-3 text-center w-[150px]">到货日期</th>
                            <th className="px-4 py-3 text-center w-[250px]">供应商</th>
                            <th className="px-4 py-3 text-center">品系</th>
                            <th className="px-4 py-3 w-32 text-center ">规格</th>
                            <th className="px-4 py-3 text-center w-[120px]">雄数</th>
                            <th className="px-4 py-3 text-center w-[120px]">雌数</th>
                            <th className="px-4 py-3 text-center w-[120px]">负责人(PI)</th>
                            <th className="px-4 py-3 text-center w-[120px]">领用人</th>
                            <th className="px-4 py-3 border-l border-slate-200 text-center w-[120px]">领用方式/房间</th>
                            <th className="px-4 py-3 border-l border-slate-200 text-center w-[120px]">订单状态</th>
                            <th className="px-4 py-3 border-l border-slate-200 text-center w-[120px]">校区</th>
                        </tr>
                        </thead>

                        <tbody>
                        {/* 第一行：课题组超级汇总行 */}
                        <tr className="bg-gradient-to-r from-blue-50 to-indigo-50/30 border-b-2 border-blue-200 sticky top-[49px] z-20 shadow-sm">
                            <td className="px-5 py-3.5 sticky left-0 z-30 bg-gradient-to-r from-blue-50 to-blue-50/90 shadow-[1px_0_0_#bfdbfe]">
                                <div className="flex flex-col gap-1.5 mt-1">
                                    <div className="flex items-center gap-2">
                                        {page === 1 && <Crown className="w-6 h-6 text-yellow-500 drop-shadow-sm" />}
                                        <span className="text-2xl font-black text-slate-800">{summary.projectName}</span>
                                    </div>
                                    <span className="text-sm font-bold text-blue-600 bg-blue-100/50 w-max px-2.5 py-1 rounded-md">PI: {summary.piName || '-'}</span>
                                </div>
                            </td>

                            <td colSpan={2} className="px-4 py-3.5 align-middle text-right border-r border-blue-100">
                                <div className="flex flex-col items-end mr-4">
                                    <span className="text-base font-bold text-slate-400">本月新增消耗</span>
                                    <span className="text-2xl font-black text-amber-600">+{summary.monthQty || 0}</span>
                                </div>
                            </td>

                            <td colSpan={2} className="px-4 py-3.5 align-middle bg-blue-100/30 border-r border-blue-100">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col items-center ml-2">
                                        <span className="text-sm font-bold text-slate-500 mb-1">历史总订购</span>
                                        <span className="text-4xl font-black text-blue-700">{summary.totalQty || 0}</span>
                                    </div>
                                    <span className="text-base text-slate-400 font-bold mt-5">只</span>
                                </div>
                            </td>

                            <td className="px-4 py-3.5 text-center align-middle bg-indigo-50/50">
                                <div className="flex flex-col items-center">
                                    <span className="text-sm font-bold text-slate-500 mb-1">♂ 雄数</span>
                                    <span className="text-3xl font-black text-indigo-600">{summary.maleQty || 0}</span>
                                </div>
                            </td>

                            <td className="px-4 py-3.5 text-center align-middle bg-rose-50/50 border-r border-blue-100">
                                <div className="flex flex-col items-center">
                                    <span className="text-sm font-bold text-slate-500 mb-1">♀ 雌数</span>
                                    <span className="text-3xl font-black text-rose-600">{summary.femaleQty || 0}</span>
                                </div>
                            </td>

                            <td colSpan={5} className="px-4 py-3.5 align-middle text-slate-400 text-base font-bold text-center">
                                👈 课题组历史消耗全景画像
                            </td>
                        </tr>

                        {/* 💥 优化 2：斑马纹底色交替 + 压缩格子高度 + 字体放大 */}
                        {detailLogs.map((log: any, index: number) => {
                            // 💥 终极修复：使用视觉反差极大的淡紫色作为奇数行背景
                            const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-indigo-50/70';

                            return (
                                // 💥 同时，将悬停颜色也加深，强化交互感
                                <tr key={log.item_id} className={`${rowBg} hover:bg-blue-100/70 transition-colors border-b border-slate-100 text-base`}>
                                    <td className={`px-4 py-2.5 font-mono text-sm text-slate-500 sticky left-0 shadow-[1px_0_0_#f1f5f9] group-hover:bg-blue-50/50 transition-colors ${rowBg}`}>
                                        {log.sn}
                                    </td>

                                    <td className="px-4 py-2.5 font-bold text-slate-700 text-center">{log.arrival_date || '-'}</td>
                                    <td className="px-4 py-2.5 text-slate-600 text-sm max-w-[140px] whitespace-normal text-center" title={log.supplier_name}>
                                        {log.supplier_name?.replace('有限责任公司', '')?.replace('有限公司', '') || '-'}
                                    </td>
                                    <td className="px-4 py-2.5 font-black text-blue-800 text-lg text-center">{log.strain_name || '-'}</td>
                                    <td className="px-4 py-2.5 text-slate-600 font-bold text-sm max-w-[120px] whitespace-normal text-center">{log.spec_name || '-'}</td>

                                    <td className="px-4 py-2.5 text-center font-black text-indigo-500 text-xl bg-indigo-50/20">{log.male_qty}</td>
                                    <td className="px-4 py-2.5 text-center font-black text-rose-500 text-xl bg-rose-50/20">{log.female_qty}</td>

                                    <td className="px-4 py-2.5 font-bold text-slate-700 text-center">{log.pi_name || '-'}</td>
                                    <td className="px-4 py-2.5 text-slate-800 text-base font-bold text-center">
                                        {log.collector_name || '-'}
                                    </td>
                                    <td className="px-4 py-2.5 border-l border-slate-100 text-center">
                                        <span className={`font-black px-3 py-1.5 rounded text-sm border ${log.consume_location?.includes('取走') ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-blue-700 bg-blue-50 border-blue-200'}`}>
                                            {log.consume_location || '-'}
                                        </span>
                                    </td>

                                    <td className="px-4 py-2.5 border-l border-slate-100 text-center">
                                        <span className={`font-bold text-sm ${log.order_state_name?.includes('取消') || log.order_state_name?.includes('驳回') ? 'text-slate-400 line-through' : (log.order_state_name?.includes('通过') ? 'text-blue-600' : 'text-emerald-600')}`}>
                                            {log.order_state_name || '未知状态'}
                                        </span>
                                    </td>

                                    <td className="px-4 py-2.5 border-l border-slate-100 text-center">
                                        <span className={`font-bold px-3 py-1.5 rounded border text-sm ${log.area_name?.includes('浦东') ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                                            {log.area_name || '未知'}
                                        </span>
                                    </td>
                                </tr>
                            )
                        })}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-20 flex flex-col items-center justify-center text-slate-400 h-full">
                        <Search className="w-12 h-12 mb-4 opacity-50" />
                        <span className="font-bold text-lg">本地库中暂无该课题组的订购流水源数据</span>
                    </div>
                )}
            </div>
        </div>
    );
}