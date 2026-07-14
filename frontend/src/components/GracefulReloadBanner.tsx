import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ReloadReason } from '@/hooks/useClientVersionPoll';

const COUNTDOWN_SECONDS = 20;
const SNOOZE_SECONDS = 120;
const PROGRESS_SEGMENTS = 20;

interface Props {
    reason: ReloadReason;
    onDismiss: () => void;
}

export function GracefulReloadBanner({ reason, onDismiss }: Props) {
    const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
    const [snoozed, setSnoozed] = useState(false);
    const [visible, setVisible] = useState(false);
    const [iconSpinOnce, setIconSpinOnce] = useState(true);
    const hasReloadedRef = useRef(false);
    const snoozeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const prefersReducedMotion = useRef(
        typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    // 入场动画：挂载后下一帧触发
    useEffect(() => {
        const raf = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    // 图标单次旋转：挂载 200ms 后停止
    useEffect(() => {
        if (prefersReducedMotion.current) {
            setIconSpinOnce(false);
            return;
        }
        const id = setTimeout(() => setIconSpinOnce(false), 200);
        return () => clearTimeout(id);
    }, []);

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
        setIconSpinOnce(!prefersReducedMotion.current);
        if (snoozeTimerRef.current) {
            clearTimeout(snoozeTimerRef.current);
            snoozeTimerRef.current = undefined;
        }
        // 重新播放入场
        setVisible(false);
        const raf = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(raf);
    }, [reason]);

    const doReload = useCallback(() => {
        if (hasReloadedRef.current) return;
        hasReloadedRef.current = true;
        window.location.reload();
    }, []);

    // 倒计时
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
            setVisible(false);
            requestAnimationFrame(() => setVisible(true));
        }, SNOOZE_SECONDS * 1000);
    };

    const message =
        reason === 'version-mismatch'
            ? '检测到系统更新，建议刷新页面获取最新版本'
            : '管理员请求了页面同步，即将自动刷新';

    const filledSegments = Math.round((countdown / COUNTDOWN_SECONDS) * PROGRESS_SEGMENTS);

    return (
        <div
            role="alert"
            aria-live="polite"
            className={[
                'fixed inset-x-4 bottom-6 z-[var(--z-modal)] mx-auto max-w-sm',
                'transition-[transform,opacity] duration-300',
                visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
                prefersReducedMotion.current ? '' : 'ease-[cubic-bezier(0.16,1,0.3,1)]',
            ].join(' ')}
        >
            {/* 背景层：实色 + 模糊 + 阴影 */}
            <div
                className="rounded-2xl p-5"
                style={{
                    background: 'var(--app-color-surface-container)',
                    boxShadow: [
                        '0 0 0 1px var(--app-color-border-default)',
                        '0 8px 32px rgba(0,0,0,0.18)',
                        '0 2px 6px rgba(0,0,0,0.08)',
                    ].join(', '),
                }}
            >
                {/* 标题行：图标 + 消息 */}
                <div className="flex items-start gap-3 mb-4">
                    <div
                        className="mt-0.5 shrink-0 transition-transform"
                        style={{
                            transitionDuration: iconSpinOnce ? '200ms' : '0ms',
                            transform: iconSpinOnce ? 'rotate(360deg)' : 'rotate(0deg)',
                        }}
                    >
                        <RefreshCw
                            size={18}
                            style={{ color: 'var(--app-color-accent)' }}
                        />
                    </div>
                    <p
                        className="text-sm leading-relaxed flex-1"
                        style={{ color: 'var(--app-color-text-primary)' }}
                    >
                        {message}
                    </p>
                </div>

                {/* 进度条 */}
                <div className="flex gap-[3px] mb-4" aria-hidden>
                    {Array.from({ length: PROGRESS_SEGMENTS }).map((_, i) => (
                        <div
                            key={i}
                            className="h-1 flex-1 rounded-full transition-colors duration-500"
                            style={{
                                background: i < filledSegments
                                    ? 'var(--app-color-accent)'
                                    : 'var(--app-color-surface-hover)',
                            }}
                        />
                    ))}
                </div>

                {/* 倒计时文字 */}
                <p
                    className="text-xs mb-4 text-center"
                    style={{ color: 'var(--app-color-text-secondary)' }}
                >
                    {snoozed
                        ? '已推迟，稍后提醒'
                        : `${countdown} 秒后自动刷新`}
                </p>

                {/* 按钮行 */}
                <div className="flex gap-3">
                    {!snoozed && (
                        <button
                            onClick={handleSnooze}
                            className="flex-1 px-4 py-2 text-[13px] font-medium rounded-xl border cursor-pointer transition-colors duration-150 hover:opacity-80"
                            style={{
                                borderColor: 'var(--app-color-border-default)',
                                color: 'var(--app-color-text-secondary)',
                                background: 'transparent',
                            }}
                        >
                            稍后提醒
                        </button>
                    )}
                    <button
                        onClick={doReload}
                        className="flex-1 px-4 py-2 text-[13px] font-semibold rounded-xl cursor-pointer transition-opacity duration-150 hover:opacity-90 active:scale-[0.98]"
                        style={{
                            background: 'var(--app-color-accent)',
                            color: '#FFFFFF',
                        }}
                    >
                        立即刷新
                    </button>
                </div>
            </div>
        </div>
    );
}
