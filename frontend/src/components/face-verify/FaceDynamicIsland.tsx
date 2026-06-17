import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ScanFace, Check, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Z_INDEX } from '@/constants/zIndex';
import { FACE_VERIFY_MAX_RETRIES, FACE_ISLAND_FAILED_HOLD_MS } from './faceConfig';
import type { ScanStatus } from './types';

interface Props {
  status: ScanStatus;
  /** 当前已完成的重试次数（0=首轮）；扫描/失败文案均显示为 (n/总次数) */
  retryAttempt?: number;
  /** 失败态主文案；默认「验证失败」 */
  failedLabel?: string;
  onStatusComplete?: (status: ScanStatus) => void;
}

const spring = { type: 'spring' as const, stiffness: 500, damping: 22 };

function islandShellClass(status: ScanStatus): string {
  const base =
    'flex items-center gap-3 px-5 py-3 rounded-full shadow-[var(--app-elevation-modal)] border backdrop-blur-none';
  if (status === 'success') {
    return `${base} bg-[var(--app-color-feedback-success-soft)] border-[color-mix(in_srgb,var(--app-color-feedback-success)_35%,var(--app-color-border-default))]`;
  }
  if (status === 'failed') {
    return `${base} bg-[var(--app-color-feedback-danger-soft)] border-[color-mix(in_srgb,var(--app-color-feedback-danger)_35%,var(--app-color-border-default))]`;
  }
  return `${base} bg-[var(--app-color-surface-elevated)] border-[var(--app-color-border-default)]`;
}

function islandTextClass(status: ScanStatus): string {
  if (status === 'success') return 'text-[var(--app-color-feedback-success)]';
  if (status === 'failed') return 'text-[var(--app-color-feedback-danger)]';
  return 'text-[var(--app-color-text-primary)]';
}

export function FaceDynamicIsland({ status, retryAttempt = 0, failedLabel = '验证失败', onStatusComplete }: Props) {
  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(() => onStatusComplete?.('success'), 1500);
      return () => clearTimeout(t);
    }
    if (status === 'failed') {
      const t = setTimeout(() => onStatusComplete?.('failed'), FACE_ISLAND_FAILED_HOLD_MS);
      return () => clearTimeout(t);
    }
  }, [status, onStatusComplete]);

  if (status === 'idle') return null;

  const isSuccess = status === 'success';
  const isFailed = status === 'failed';
  const isScanning = status === 'scanning';
  const attemptNo = Math.min(retryAttempt + 1, FACE_VERIFY_MAX_RETRIES);
  const attemptSuffix = ` (${attemptNo}/${FACE_VERIFY_MAX_RETRIES})`;
  const scanningLabel =
    retryAttempt > 0 ? `重新识别中${attemptSuffix}` : `识别中${attemptSuffix}`;
  const failedDisplayLabel = `${failedLabel}${attemptSuffix}`;

  return createPortal(
    <div
      className="fixed pointer-events-auto"
      style={{
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: Z_INDEX.faceScan,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -4 }}
        transition={spring}
      >
        <motion.div
          layout
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className={islandShellClass(status)}
        >
          <div className="relative h-7 w-7 shrink-0">
            {isScanning && (
              <motion.div
                key="ring"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--app-color-accent)] border-r-[var(--app-color-accent-secondary)]"
              />
            )}
            {(isSuccess || isFailed) && (
              <motion.div
                key={isSuccess ? 'check' : 'x'}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.15 }}
                className={`absolute inset-0 flex items-center justify-center rounded-full ${
                  isSuccess
                    ? 'bg-[var(--app-color-feedback-success)] text-[var(--app-color-text-inverse)]'
                    : 'bg-[var(--app-color-feedback-danger)] text-[var(--app-color-text-inverse)]'
                }`}
              >
                {isSuccess ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : (
                  <X className="h-4 w-4" strokeWidth={3} />
                )}
              </motion.div>
            )}
            {isScanning && (
              <motion.div
                key="face"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <ScanFace className="h-7 w-7 p-[3px] text-[var(--app-color-accent)]" />
              </motion.div>
            )}
          </div>

          <AnimatePresence mode="wait">
            <motion.span
              key={`${status}-${retryAttempt}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              transition={{ duration: 0.2 }}
              className={`whitespace-nowrap text-sm font-semibold ${islandTextClass(status)}`}
            >
              {isScanning ? scanningLabel : isSuccess ? '验证通过' : failedDisplayLabel}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}
