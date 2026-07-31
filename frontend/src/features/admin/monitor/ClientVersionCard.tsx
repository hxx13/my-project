import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RefreshCw, CheckCircle, AlertTriangle, Circle } from 'lucide-react';
import { fetchClientVersionStats, broadcastClientReload, type ClientVersionStats } from '@/api/domains/clientVersion.api';
import { AdminButton } from '@/components/admin/AdminButton';

export function ClientVersionCard() {
    const [stats, setStats] = useState<ClientVersionStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = async () => {
        try {
            setError(null);
            const data = await fetchClientVersionStats();
            setStats(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : '加载失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        const id = setInterval(fetchStats, 60_000);
        return () => clearInterval(id);
    }, []);

    const handleBroadcast = async () => {
        const outdated = stats?.outdated ?? '?';
        if (!window.confirm(`预计影响 ${outdated} 台客户端，建议先确认新版本已部署完成。\n\n是否继续？`)) return;
        try {
            const result = await broadcastClientReload();
            toast.success(`已下发。${result.stats.totalClients} 台在线，${result.stats.outdated} 台待刷新。`);
            fetchStats();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '广播失败');
        }
    };

    // ── 状态 D：异常 ──
    if (error || stats?.expectedBuildId === 'unknown') {
        return (
            <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5">
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={18} style={{ color: 'var(--app-color-feedback-warning)' }} />
                    <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">客户端版本状态</span>
                </div>
                <p className="text-sm text-[var(--app-color-text-secondary)]">
                    版本信息不可用。未找到 build-meta.json，请检查前端部署是否完整。客户端自动刷新功能暂时不可用。
                </p>
            </div>
        );
    }

    // ── 状态 C：空 ──
    if (!loading && stats && stats.totalClients === 0) {
        return (
            <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Circle size={18} style={{ color: 'var(--app-color-text-tertiary)' }} />
                    <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">客户端版本状态</span>
                </div>
                <p className="text-sm text-[var(--app-color-text-tertiary)]">
                    暂无客户端在线。客户端上线后将自动出现在此列表中。
                </p>
            </div>
        );
    }

    // ── 状态 A/B：正常 ──
    const allUpToDate = stats && stats.outdated === 0;

    return (
        <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {allUpToDate ? (
                        <CheckCircle size={18} style={{ color: 'var(--app-color-feedback-success)' }} />
                    ) : (
                        <RefreshCw size={18} style={{ color: 'var(--app-color-accent)' }} />
                    )}
                    <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">客户端版本状态</span>
                    {allUpToDate && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]">
                            全部最新
                        </span>
                    )}
                </div>
                <AdminButton type="button" tone="primary" size="sm" className="gap-1.5" onClick={() => void handleBroadcast()}>
                    <RefreshCw size={14} />
                    同步在线页
                </AdminButton>
            </div>

            {stats && (
                <>
                    <div className="text-xs text-[var(--app-color-text-secondary)] mb-3">
                        期望版本 <code className="text-[var(--app-color-text-primary)]">{stats.expectedBuildId}</code>
                        {' · '}活跃客户端 <strong>{stats.totalClients}</strong>
                    </div>

                    {/* 版本分布条形图 */}
                    <div className="space-y-1.5 mb-3">
                        {Object.entries(stats.distribution).map(([version, count]) => {
                            const isLatest = version === stats.expectedBuildId;
                            const pct = stats.totalClients > 0 ? (count / stats.totalClients) * 100 : 0;
                            return (
                                <div key={version} className="flex items-center gap-2 text-xs">
                                    <span className="w-16 text-right text-[var(--app-color-text-tertiary)] truncate" title={version}>
                                        {isLatest ? '最新' : version.slice(0, 8)}
                                    </span>
                                    <div className="flex-1 h-4 rounded-sm bg-[var(--app-color-surface-hover)] overflow-hidden">
                                        <div
                                            className="h-full rounded-sm transition-all"
                                            style={{
                                                width: `${pct}%`,
                                                background: isLatest
                                                    ? 'var(--app-color-feedback-success)'
                                                    : 'var(--app-color-feedback-warning)',
                                            }}
                                        />
                                    </div>
                                    <span className="w-6 text-[var(--app-color-text-secondary)]">{count}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* 上次刷新指令 */}
                    {stats.lastReloadTriggeredAt && (
                        <div className="text-xs text-[var(--app-color-text-tertiary)]">
                            上次同步指令 {stats.lastReloadTriggeredAt.replace('T', ' ').slice(0, 19)}
                            {stats.lastReloadTriggeredBy ? ` ${stats.lastReloadTriggeredBy} 触发` : ''}
                            {' · '}
                            {stats.upToDate}/{stats.totalClients} 已更新
                            {stats.outdated > 0 && ` (${stats.outdated}台待刷新)`}
                        </div>
                    )}
                    {!stats.lastReloadTriggeredAt && (
                        <div className="text-xs text-[var(--app-color-text-tertiary)]">上次同步指令 — 无记录 —</div>
                    )}
                </>
            )}

            {loading && <div className="text-xs text-[var(--app-color-text-tertiary)]">加载中…</div>}
        </div>
    );
}
