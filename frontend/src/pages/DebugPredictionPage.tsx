import {useEffect, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {fetchDebugPredictionUserPage, triggerModelCalculation} from "@/api/twinApi";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import { AdminToolbar, AdminToolbarActions } from "@/components/admin/AdminToolbar";
import {BrainCircuit} from "lucide-react";
import {DebugPredictionPersonCard} from "@/features/twin-debug/DebugPredictionPersonCard";

import { appAlert } from "@/lib/appDialog";
export default function DebugPredictionPage() {
    const [page, setPage] = useState(1);
    const pageSize = 16;
    const [keyword, setKeyword] = useState("");
    const [searchDraft, setSearchDraft] = useState("");
    const [isCalculating, setIsCalculating] = useState(false);

    useEffect(() => {
        setSearchDraft(keyword);
    }, [keyword]);

    const {data, isLoading, refetch} = useQuery({
        queryKey: ["debugPredictionsByUser", page, pageSize, keyword],
        queryFn: () => fetchDebugPredictionUserPage(page, pageSize, keyword.trim()),
    });

    const totalPages = data?.total ? Math.ceil(data.total / pageSize) : 0;
    const users = data?.data ?? [];

    const submitSearch = () => {
        setPage(1);
        setKeyword(searchDraft.trim());
    };

    const handleTriggerCalculation = async () => {
        setIsCalculating(true);
        try {
            await triggerModelCalculation("ALL");
            await appAlert("后端已启动全量模型推演，请稍后刷新。");
            setTimeout(() => refetch(), 2000);
        } catch {
            /* ignore */
        } finally {
            setIsCalculating(false);
        }
    };

    if (isLoading) {
        return (
            <div data-twin-debug-prediction className="p-10 text-xl font-bold text-[var(--app-color-text-tertiary)]">
                正在加载 AI 行为预测库…
            </div>
        );
    }

    return (
        <div data-twin-debug-prediction className="box-border flex h-full flex-col overflow-y-auto bg-[var(--app-color-surface-page)] p-6 md:p-8">
            <AdminToolbar className="mb-4 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
                <div className="min-w-0 max-w-[min(40vw,22rem)] shrink">
                    <h1 className="flex items-center gap-2 truncate text-xl font-black text-[var(--app-color-text-primary)] sm:text-2xl">
                        <BrainCircuit className="h-7 w-7 shrink-0 text-[var(--app-color-accent)]"/> AI行为预测库
                    </h1>
                    <p className="truncate text-xs text-[var(--app-color-text-tertiary)]">共 {data?.total ?? 0} 人 · 排序与人员资料库一致</p>
                </div>
                <AdminToolbarActions className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2">
                    <DebugDangerousOpsMenu
                        items={[
                            {
                                key: "pred-calc",
                                label: isCalculating ? "模型计算中…" : "触发模型重算",
                                minRole: "SUPER_ADMIN",
                                disabled: isCalculating,
                                onSelect: () => {
                                    void handleTriggerCalculation();
                                },
                            },
                        ]}
                    />
                    <AdminToolbarSearchField
                        className="w-[min(42vw,14rem)] shrink-0 sm:w-56"
                        placeholder="搜人名、学号或房间…"
                        value={searchDraft}
                        onChange={(val) => {
                            setSearchDraft(val);
                            if (!val.trim()) {
                                setPage(1);
                                setKeyword("");
                            }
                        }}
                        onSubmit={submitSearch}
                    />
                    <div className="flex shrink-0 flex-nowrap items-center gap-1 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-1.5 shadow-[var(--app-elevation-card)] sm:gap-2 sm:px-4">
                        <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="text-lg font-black text-[var(--app-color-accent)] disabled:text-[var(--app-color-text-tertiary)]">◀</button>
                        <span className="whitespace-nowrap text-sm font-bold text-[var(--app-color-text-secondary)] sm:text-base">第 {page} / {totalPages || 1} 页</span>
                        <button type="button" disabled={page === totalPages || totalPages === 0} onClick={() => setPage((p) => p + 1)} className="text-lg font-black text-[var(--app-color-accent)] disabled:text-[var(--app-color-text-tertiary)]">▶</button>
                    </div>
                </AdminToolbarActions>
            </AdminToolbar>

            <div className="flex-1 overflow-auto pb-16">
                {users.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-container)] p-12 text-center font-bold text-[var(--app-color-text-tertiary)]">
                        暂无预测数据
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {users.map((user) => (
                            <DebugPredictionPersonCard key={user.userId} user={user}/>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
