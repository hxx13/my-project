import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCw, X, XCircle } from 'lucide-react';
import { Z_INDEX } from '@/constants/zIndex';

interface Props {
  message: string;
  type: 'warning' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
  open: boolean;
  /** 自动消失毫秒，默认 4000。设为 0 不自动消失 */
  duration?: number;
  onDismiss?: () => void;
}

function toastShellClass(type: Props['type']): string {
  const base =
    'flex min-w-[min(320px,88vw)] items-center gap-3 rounded-[var(--app-radius-container)] border px-4 py-3 shadow-[var(--app-elevation-modal)] backdrop-blur-none';
  if (type === 'warning') {
    return `${base} bg-[var(--app-color-feedback-warning-soft)] border-[color-mix(in_srgb,var(--app-color-feedback-warning)_35%,var(--app-color-border-default))]`;
  }
  if (type === 'error') {
    return `${base} bg-[var(--app-color-feedback-danger-soft)] border-[color-mix(in_srgb,var(--app-color-feedback-danger)_35%,var(--app-color-border-default))]`;
  }
  return `${base} bg-[var(--app-color-surface-elevated)] border-[var(--app-color-border-default)]`;
}

function toastAccentClass(type: Props['type']): string {
  if (type === 'warning') return 'text-[var(--app-color-feedback-warning)]';
  if (type === 'error') return 'text-[var(--app-color-feedback-danger)]';
  return 'text-[var(--app-color-accent)]';
}

function toastActionClass(type: Props['type']): string {
  const base =
    'flex shrink-0 items-center gap-1.5 rounded-[var(--app-radius-element)] border px-3 py-1.5 text-xs font-semibold transition-colors';
  if (type === 'warning') {
    return `${base} border-[color-mix(in_srgb,var(--app-color-feedback-warning)_45%,var(--app-color-border-default))] bg-[var(--app-color-surface-container)] text-[var(--app-color-feedback-warning)] hover:bg-[var(--app-color-surface-hover)]`;
  }
  if (type === 'error') {
    return `${base} border-[color-mix(in_srgb,var(--app-color-feedback-danger)_45%,var(--app-color-border-default))] bg-[var(--app-color-surface-container)] text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-surface-hover)]`;
  }
  return `${base} border-[var(--app-color-accent)]/40 bg-[var(--app-color-accent)]/12 text-[var(--app-color-accent)] hover:bg-[var(--app-color-accent)]/20`;
}

export function FaceResultToast({ message, type, action, open, duration = 4000, onDismiss }: Props) {
  const accent = toastAccentClass(type);
  const Icon = type === 'error' ? XCircle : AlertTriangle;

  useEffect(() => {
    if (!open || !duration) return;
    const t = setTimeout(() => onDismiss?.(), duration);
    return () => clearTimeout(t);
  }, [open, duration, onDismiss]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.96, x: '-50%' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
          exit={{ opacity: 0, y: -4, scale: 0.98, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className={`fixed left-1/2 ${toastShellClass(type)}`}
          style={{
            top: 440,
            zIndex: Z_INDEX.faceScan,
          }}
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-[var(--app-color-surface-container)] ${accent} ${
              type === 'warning'
                ? 'border-[color-mix(in_srgb,var(--app-color-feedback-warning)_40%,var(--app-color-border-default))]'
                : type === 'error'
                  ? 'border-[color-mix(in_srgb,var(--app-color-feedback-danger)_40%,var(--app-color-border-default))]'
                  : 'border-[var(--app-color-border-default)]'
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className={`min-w-0 flex-1 text-sm font-medium leading-snug text-[var(--app-color-text-primary)]`}>
            {message}
          </span>
          {action && (
            <button type="button" onClick={action.onClick} className={toastActionClass(type)}>
              <RefreshCw className="h-3 w-3" />
              {action.label}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] transition-colors hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
              aria-label="关闭提示"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
