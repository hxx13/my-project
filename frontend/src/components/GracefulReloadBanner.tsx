import { useState, useEffect, useRef, useCallback } from 'react';
import { X, RefreshCw } from 'lucide-react';
import type { ReloadReason } from '@/hooks/useClientVersionPoll';

const COUNTDOWN_SECONDS = 20;
const SNOOZE_SECONDS = 120;

interface Props {
    reason: ReloadReason;
    onDismiss: () => void;
}

export function GracefulReloadBanner({ reason, onDismiss }: Props) {
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [snoozed, setSnoozed] = useState(false);
    const hasReloadedRef = useRef(false);
    const snoozeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // 组件卸载时清理 snooze 定时器
    useEffect(() => {
        return () => {
            if (snoozeTimerRef.current) clearTimeout(snoozeTimerRef.current);
        };
    }, []);

    // reason 变化时重置 snooze 状态
    useEffect(() => {
        setSnoozed(false);
        setCountdown(COUNTDOWN_SECONDS);
        if (snoozeTimerRef.current) {
            clearTimeout(snoozeTimerRef.current);
            snoozeTimerRef.current = undefined;
        }
    }, [reason]);

    const doReload = useCallback(() => {
        if (hasReloadedRef.current) return;
        hasReloadedRef.current = true;
        window.location.reload();
    }, []);

    useEffect(() => {
        if (snoozed) return;
        if (countdown <= 0) {
            doReload();
            return;
        }
        const id = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(id);
    }, [countdown, snoozed, doReload]);

    const handleSnooze = () => {
        setSnoozed(true);
        snoozeTimerRef.current = setTimeout(() => {
            setSnoozed(false);
            setCountdown(COUNTDOWN_SECONDS);
        }, SNOOZE_SECONDS * 1000);
    };

    const message =
        reason === 'version-mismatch'
            ? '检测到系统更新，建议刷新页面获取最新版本'
            : '管理员请求了页面同步，即将自动刷新';

    return (
        <div
            role="alert"
            aria-live="polite"
            className="fixed top-0 left-0 right-0 z-[var(--z-sticky)] flex items-center justify-between px-5 py-3"
            style={{
                background: 'var(--app-color-surface-raised)',
                borderBottom: '1px solid var(--app-color-border-default)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
        >
            <div className="flex items-center gap-2.5">
                <RefreshCw
                    size={18}
                    className={snoozed ? '' : 'animate-spin'}
                    style={{ color: 'var(--app-color-accent)' }}
                />
                <span className="text-sm font-medium text-[var(--app-color-text-primary)]">
                    {message}
                </span>
                {!snoozed && (
                    <span className="text-[13px] text-[var(--app-color-text-secondary)]">
                        {countdown} 秒后自动刷新
                    </span>
                )}
                {snoozed && (
                    <span className="text-[13px] text-[var(--app-color-text-tertiary)]">
                        已推迟，稍后提醒
                    </span>
                )}
            </div>

            <div className="flex gap-2">
                {!snoozed && (
                    <button
                        onClick={handleSnooze}
                        className="px-3.5 py-1.5 text-[13px] rounded-[var(--app-radius-sm)] border border-[var(--app-color-border-default)] bg-transparent text-[var(--app-color-text-secondary)] cursor-pointer"
                    >
                        稍后提醒
                    </button>
                )}
                <button
                    onClick={doReload}
                    className="px-3.5 py-1.5 text-[13px] font-medium rounded-[var(--app-radius-sm)] text-white cursor-pointer"
                    style={{ background: 'var(--app-color-accent)' }}
                >
                    立即刷新
                </button>
                {snoozed && (
                    <button
                        onClick={onDismiss}
                        className="p-1.5 rounded-[var(--app-radius-sm)] bg-transparent text-[var(--app-color-text-tertiary)] cursor-pointer"
                        aria-label="关闭"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}
