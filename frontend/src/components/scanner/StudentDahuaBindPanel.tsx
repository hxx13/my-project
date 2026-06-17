import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchScanCardMapping,
  studentDahuaBind,
  type ScanCardMappingStatus,
  type StudentDahuaBindResult,
} from "@/api/domains/scanner.api";
import { DahuaCardMappingStatusPanel } from "./DahuaCardMappingStatusPanel";
import {
  isValidStudentDahuaCardNo,
  sanitizeStudentDahuaCardNo,
  STUDENT_DAHUA_CARD_LEN,
} from "./studentDahuaCardInput";
import { SCAN_NESTED_BACKDROP, SCAN_MODAL_LAYER_PROPS } from "./scanPopupTheme";

export function StudentDahuaBindPanel({
  userId,
  userName,
  onSuccess,
  onCancel,
}: {
  userId: string;
  userName: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [cardNo, setCardNo] = useState("");
  const [mapping, setMapping] = useState<ScanCardMappingStatus | null>(null);
  const [mappingLoading, setMappingLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [issueResult, setIssueResult] = useState<StudentDahuaBindResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cardScanBufferRef = useRef("");
  const cardScanResetTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const reloadMapping = async () => {
    setMappingLoading(true);
    try {
      const data = await fetchScanCardMapping(userId);
      setMapping(data);
    } catch (e) {
      setMapping({ bound: false });
      setError(e instanceof Error ? e.message : "查询绑卡状态失败");
    } finally {
      setMappingLoading(false);
    }
  };

  useEffect(() => {
    void reloadMapping();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随 userId 刷新
  }, [userId]);

  // 弹窗打开时聚焦输入框，重置 buffer
  useEffect(() => {
    cardScanBufferRef.current = "";
    if (cardScanResetTimer.current) {
      clearTimeout(cardScanResetTimer.current);
      cardScanResetTimer.current = null;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  // 清理 timer
  useEffect(() => {
    return () => {
      if (cardScanResetTimer.current) clearTimeout(cardScanResetTimer.current);
    };
  }, []);

  /** 更新卡号 buffer + state，重置 1200ms 空闲后清空（适配读卡器连发后重新刷卡） */
  const updateCardNoWithBuffer = useCallback((nextValue: string) => {
    cardScanBufferRef.current = nextValue;
    setCardNo(nextValue);
    if (cardScanResetTimer.current) {
      clearTimeout(cardScanResetTimer.current);
    }
    cardScanResetTimer.current = window.setTimeout(() => {
      cardScanBufferRef.current = "";
      setCardNo("");
      cardScanResetTimer.current = null;
    }, 1200);
  }, []);

  /** 与 DebugCardMappingPage / 首页程序坞扫码一致：window capture 处理按键，避免中文输入法抢占读卡器字符 */
  useEffect(() => {
    const onWinKeyDown = (e: KeyboardEvent) => {
      const el = inputRef.current;
      if (!el || document.activeElement !== el) return;
      if (e.isComposing || e.key === "Process" || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) {
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key;
      if (key === "Tab") return;
      if (key === "Enter") {
        e.preventDefault();
        if (!confirmOpen && isValidStudentDahuaCardNo(cardScanBufferRef.current)) {
          setError("");
          setConfirmOpen(true);
        }
        return;
      }
      if (key === "Backspace") {
        e.preventDefault();
        updateCardNoWithBuffer(cardScanBufferRef.current.slice(0, -1));
        return;
      }
      if (key.length !== 1) {
        e.preventDefault();
        return;
      }
      if (!/[0-9A-Za-z]/.test(key)) {
        e.preventDefault();
        return;
      }
      if (cardScanBufferRef.current.length >= STUDENT_DAHUA_CARD_LEN) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      updateCardNoWithBuffer(`${cardScanBufferRef.current}${key}`);
    };
    window.addEventListener("keydown", onWinKeyDown, true);
    return () => window.removeEventListener("keydown", onWinKeyDown, true);
  }, [confirmOpen]);

  const handleRequestConfirm = () => {
    const clean = sanitizeStudentDahuaCardNo(cardNo);
    if (!isValidStudentDahuaCardNo(clean)) {
      setCardNo("");
      setError(`请先刷入 ${STUDENT_DAHUA_CARD_LEN} 位字母或数字卡号`);
      return;
    }
    setError("");
    setConfirmOpen(true);
  };

  const handleConfirmBind = async () => {
    const clean = sanitizeStudentDahuaCardNo(cardNo);
    if (!isValidStudentDahuaCardNo(clean)) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await studentDahuaBind({
        userId,
        userName,
        cardNo: clean,
      });
      setIssueResult(result);
      if (result.success) {
        onSuccess();
        return;
      }
      const last = (result.steps || []).find((s) => s.success === false);
      setError(last?.upstreamErrMsg || last?.message || "绑卡失败，请重试或联系管理员");
      setConfirmOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "绑卡失败");
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const cardReady = isValidStudentDahuaCardNo(cardNo);

  return (
    <div {...SCAN_MODAL_LAYER_PROPS} className={`fixed inset-0 top-16 z-[var(--z-modal)] flex items-center justify-center p-4 ${SCAN_NESTED_BACKDROP}`}>
      <div className="w-full max-w-md rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-[var(--app-elevation-modal)] text-[var(--app-color-text-primary)]">
        <h3 className="mb-1 text-base font-black">绑定校园卡</h3>
        <p className="mb-4 text-[11px] text-[var(--app-color-text-tertiary)]">
          部门与门组已由系统预设，仅需刷卡完成绑卡。卡号为 {STUDENT_DAHUA_CARD_LEN} 位字母或数字。
        </p>

        <div className="mb-3 rounded-[var(--app-radius-element)] border border-[var(--app-color-accent)]/30 bg-[var(--app-color-accent-soft)] px-3 py-2">
          <p className="mb-0.5 text-[10px] font-bold text-[var(--app-color-accent)]">已锁定人员</p>
          <p className="text-sm font-black text-[var(--app-color-text-primary)]">
            {userName || "未知"}{" "}
            <span className="ml-1 font-mono text-xs text-[var(--app-color-accent)]">{userId}</span>
          </p>
        </div>

        <label className="mb-1 block text-[11px] font-bold text-[var(--app-color-text-tertiary)]">绑定卡号（请刷卡）</label>
        <p className="mb-2 rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-warning)]/30 bg-[var(--app-color-feedback-warning-soft)] px-2 py-1.5 text-[10px] leading-relaxed text-[var(--app-color-text-secondary)]">
          读卡器直接刷卡即可自动填入，无需点击输入框。卡号为 {STUDENT_DAHUA_CARD_LEN} 位字母或数字。
        </p>
        <input
          ref={inputRef}
          type="text"
          inputMode="none"
          lang="en"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={cardNo}
          readOnly
          onPaste={(e) => {
            e.preventDefault();
            const pasted = sanitizeStudentDahuaCardNo(e.clipboardData.getData("text"));
            if (pasted.length <= STUDENT_DAHUA_CARD_LEN) {
              updateCardNoWithBuffer(pasted);
            }
          }}
          className="mb-1 w-full rounded-[var(--app-radius-element)] border-2 border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2.5 font-mono text-sm tracking-widest text-[var(--app-color-accent)] outline-none focus:border-[var(--app-color-accent)] caret-transparent select-none"
          placeholder={`等待读卡器输入…`}
          disabled={submitting}
          aria-invalid={cardNo.length > 0 && !cardReady}
        />
        <p className="mb-2 text-[10px] text-[var(--app-color-text-tertiary)]">
          已刷卡 {cardNo.length}/{STUDENT_DAHUA_CARD_LEN} 位
          {cardReady ? <span className="ml-1 text-[var(--app-color-feedback-success)]">· 格式正确，按 Enter 确认</span> : null}
        </p>

        <DahuaCardMappingStatusPanel mapping={mapping} loading={mappingLoading} compact />

        {issueResult && !issueResult.success && issueResult.steps && issueResult.steps.length > 0 ? (
          <div className="app-themed-scrollbar mt-2 max-h-24 overflow-auto rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-2 text-[10px] text-[var(--app-color-feedback-danger)]">
            {issueResult.steps.map((step, idx) => (
              <div key={`${step.stepName}-${idx}`}>
                [{step.success ? "成功" : "失败"}] {step.stepName} {step.upstreamErrMsg || step.message || ""}
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-2 text-[11px] text-[var(--app-color-feedback-danger)]">{error}</p> : null}

        {!confirmOpen ? (
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-hover)] px-4 py-2 text-sm font-bold text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-active)]"
              onClick={onCancel}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-2 text-sm font-bold text-[var(--app-color-text-inverse)] hover:bg-[var(--app-color-accent-hover)] disabled:opacity-50"
              onClick={handleRequestConfirm}
              disabled={submitting || !cardReady}
            >
              确认绑卡
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3 rounded-[var(--app-radius-element)] border border-[var(--app-color-feedback-warning)]/40 bg-[var(--app-color-feedback-warning-soft)] p-3">
            <p className="text-[12px] font-bold text-[var(--app-color-text-primary)]">请再次确认是否绑定以下卡号？</p>
            <p className="break-all font-mono text-sm text-[var(--app-color-text-primary)]">{sanitizeStudentDahuaCardNo(cardNo)}</p>
            <DahuaCardMappingStatusPanel mapping={mapping} loading={false} compact />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-hover)] px-3 py-1.5 text-xs font-bold text-[var(--app-color-text-secondary)]"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                返回修改
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-success)] px-3 py-1.5 text-xs font-bold text-[var(--app-color-text-inverse)] hover:opacity-90 disabled:opacity-50"
                onClick={() => void handleConfirmBind()}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                确认绑定
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
