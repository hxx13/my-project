import { useEffect, useRef, useCallback } from 'react';
import { fetchClientVersion, type ClientVersionResponse } from '@/api/domains/clientVersion.api';
import { APP_BUILD_ID, getSharedSocket, getLastAckBootId, forceSocketReconnect } from '@/config/socketUrl';

const POLL_NORMAL = parseInt(import.meta.env.VITE_POLL_INTERVAL_NORMAL || '15000', 10);
const POLL_BACKOFF_1 = parseInt(import.meta.env.VITE_POLL_INTERVAL_BACKOFF_1 || '90000', 10);
const POLL_BACKOFF_2 = parseInt(import.meta.env.VITE_POLL_INTERVAL_BACKOFF_2 || '300000', 10);
const POLL_HIDDEN = parseInt(import.meta.env.VITE_POLL_INTERVAL_HIDDEN || '120000', 10);
const RELOAD_COOLDOWN_MS = 8000;

export type ReloadReason = 'version-mismatch' | 'admin-command';

export interface ReloadTrigger {
    reason: ReloadReason;
    payload: ClientVersionResponse;
}

/**
 * 客户端版本轮询 hook。
 * 双通道互补——WebSocket 快速通道 + HTTP 轮询兜底。
 * 检测到需要刷新时调用 onReloadNeeded 回调。
 */
export function useClientVersionPoll(
    onReloadNeeded: (trigger: ReloadTrigger) => void,
) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const failCountRef = useRef(0);
    const lastSuccessRef = useRef<number>(0);
    const pollRef = useRef<() => Promise<void>>(async () => {});

    const schedule = useCallback((delayMs: number) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => pollRef.current(), delayMs);
    }, []);

    const getClientId = (): string => {
        try {
            let id = localStorage.getItem('__client_id');
            if (!id) {
                id = crypto.randomUUID();
                localStorage.setItem('__client_id', id);
            }
            return id;
        } catch {
            return 'session-' + Math.random().toString(36).slice(2, 10);
        }
    };

    const poll = useCallback(async () => {
        try {
            const clientId = getClientId();
            const response = await fetchClientVersion(clientId, APP_BUILD_ID, 'web');

            lastSuccessRef.current = Date.now();
            failCountRef.current = 0;

            // ── bootId 一致性守卫（room 成员资格兜底）──
            // socket 自认为连接正常，但轮询返回的服务端 bootId 与最近一次
            // ROOM_ACK 的 bootId 不一致 → 服务端已重启而连接未感知（room 已丢失），
            // 强制重连触发重新握手 + 重新分配 room。
            const socket = getSharedSocket();
            const ackBootId = getLastAckBootId();
            if (response.bootId && ackBootId && socket.connected && response.bootId !== ackBootId) {
                forceSocketReconnect(`bootId 不一致：poll=${response.bootId} ack=${ackBootId}`);
            }

            // ── 冷却守卫 ──
            const pageLoadAt = sessionStorage.getItem('__page_load_at');
            if (pageLoadAt) {
                const pageAge = Date.now() - parseInt(pageLoadAt, 10);
                if (pageAge < RELOAD_COOLDOWN_MS) {
                    schedule(POLL_NORMAL);
                    return;
                }
            }

            // ── 触发检查 ──
            // 1. buildId 不匹配（新部署）
            // 去重标记存"已提示过的目标版本"而非布尔值：每出现一个新版本都要重新提示一次。
            // （历史 bug：布尔标记 + sessionStorage 跨刷新存活 → 一个 tab 一生只提示一次，
            //   之后所有新部署全部静默跳过）
            if (APP_BUILD_ID !== 'dev' && response.buildId !== APP_BUILD_ID && response.buildId !== 'unknown') {
                if (sessionStorage.getItem('__version_mismatch_triggered') !== response.buildId) {
                    sessionStorage.setItem('__version_mismatch_triggered', response.buildId);
                    onReloadNeeded({ reason: 'version-mismatch', payload: response });
                    schedule(POLL_NORMAL);
                    return;
                }
                // 已对同一目标版本提示过：不重复弹横幅，但**不能 return**——
                // 必须继续走下面的 reloadId 检查，否则版本过期的客户端
                // 永远收不到"同步在线页"指令（历史 bug：此处 return 导致
                // 过期机器对管理员同步完全免疫）。
            }

            // 2. reloadId 检查（含下行修正）
            const stored = sessionStorage.getItem('__last_reload_id');
            const currentReloadId = response.reloadId;

            if (stored === null) {
                // 首次轮询：记录基线，不触发
                sessionStorage.setItem('__last_reload_id', String(currentReloadId));
            } else {
                const prevReloadId = parseInt(stored, 10);
                // 始终同步到服务端当前值——这是重启恢复的关键
                sessionStorage.setItem('__last_reload_id', String(currentReloadId));
                // 仅在严格增长时触发（NaN 安全）
                if (!isNaN(prevReloadId) && currentReloadId > prevReloadId) {
                    onReloadNeeded({ reason: 'admin-command', payload: response });
                    schedule(POLL_NORMAL);
                    return;
                }
            }

        } catch (_err) {
            failCountRef.current++;
            if (failCountRef.current >= 6) {
                schedule(POLL_BACKOFF_2);
                return;
            }
            if (failCountRef.current >= 3) {
                schedule(POLL_BACKOFF_1);
                return;
            }
        }

        const interval = document.visibilityState === 'hidden' ? POLL_HIDDEN : POLL_NORMAL;
        schedule(interval);
    }, [schedule, onReloadNeeded]);

    // 始终保持 pollRef 指向最新的 poll（解决 schedule 闭包捕获旧 poll 的问题）
    pollRef.current = poll;

    // ── 挂载：立即轮询 + 启动定时器 ──
    useEffect(() => {
        if (!sessionStorage.getItem('__page_load_at')) {
            sessionStorage.setItem('__page_load_at', String(Date.now()));
        }
        poll();

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [poll]);

    // ── visibilitychange 监听 ──
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                const elapsed = Date.now() - lastSuccessRef.current;
                if (elapsed > 30_000) {
                    if (timerRef.current) clearTimeout(timerRef.current);
                    poll();
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [poll]);

    // ── online/offline 监听 ──
    useEffect(() => {
        const handleOnline = () => {
            failCountRef.current = 0;
            if (timerRef.current) clearTimeout(timerRef.current);
            poll();
        };
        const handleOffline = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [poll]);
}
