import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Loader2 } from "lucide-react";
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
  STUDENT_DAHUA_CARD_DEBOUNCE_MS,
  STUDENT_DAHUA_CARD_LEN,
} from "./studentDahuaCardInput";

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
  const [inputHint, setInputHint] = useState("");
  const [showImeTip, setShowImeTip] = useState(false);
  const [issueResult, setIssueResult] = useState<StudentDahuaBindResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const validateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);

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

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
    };
  }, []);

  const clearValidateTimer = useCallback(() => {
    if (validateTimerRef.current) {
      clearTimeout(validateTimerRef.current);
      validateTimerRef.current = null;
    }
  }, []);

  /** 防抖：停止输入后若非 8 位合法卡号则清空（避免读卡器连发残留） */
  const scheduleLengthValidation = useCallback(
    (value: string) => {
      clearValidateTimer();
      if (!value) {
        setInputHint("");
        return;
      }
      validateTimerRef.current = setTimeout(() => {
        validateTimerRef.current = null;
        if (isValidStudentDahuaCardNo(value)) {
          setInputHint("");
          return;
        }
        setCardNo("");
        setInputHint(`卡号须为 ${STUDENT_DAHUA_CARD_LEN} 位字母或数字，已自动清空`);
      }, STUDENT_DAHUA_CARD_DEBOUNCE_MS);
    },
    [clearValidateTimer]
  );

  const applyCardInput = useCallback(
    (raw: string) => {
      const clean = sanitizeStudentDahuaCardNo(raw);
      setCardNo(clean);
      if (clean && isValidStudentDahuaCardNo(clean)) {
        clearValidateTimer();
        setInputHint("");
        return;
      }
      scheduleLengthValidation(clean);
    },
    [clearValidateTimer, scheduleLengthValidation]
  );

  const handleRequestConfirm = () => {
    const clean = sanitizeStudentDahuaCardNo(cardNo);
    if (!isValidStudentDahuaCardNo(clean)) {
      setCardNo("");
      setError(`请先输入或刷入 ${STUDENT_DAHUA_CARD_LEN} 位字母或数字卡号`);
      setInputHint("");
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

  const focusCardInput = () => {
    setShowImeTip(true);
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const cardReady = isValidStudentDahuaCardNo(cardNo);

  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-[#050A15]/90 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0f1d] shadow-2xl p-5 text-white">
        <h3 className="text-base font-black mb-1">绑定校园卡</h3>
        <p className="text-[11px] text-slate-400 mb-4">
          部门与门组已由系统预设，仅需刷卡完成绑卡。卡号为 {STUDENT_DAHUA_CARD_LEN} 位字母或数字。
        </p>

        <div className="mb-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
          <p className="text-[10px] text-indigo-300 font-bold mb-0.5">已锁定人员</p>
          <p className="text-sm font-black text-white">
            {userName || "未知"}{" "}
            <span className="font-mono text-xs text-indigo-300 ml-1">{userId}</span>
          </p>
        </div>

        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-[11px] font-bold text-slate-400">绑定卡号（请刷卡）</label>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-white/10"
            onClick={focusCardInput}
            title="网页无法直接切换系统输入法，请手动切到英文后刷卡"
          >
            <Keyboard className="h-3 w-3" aria-hidden />
            英文输入说明
          </button>
        </div>
        {showImeTip ? (
          <p className="mb-2 text-[10px] leading-relaxed text-amber-200/90 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
            请先在系统任务栏将输入法切换为<strong className="font-bold">英文</strong>（Windows：Win+空格；Mac：Control+空格），再刷卡。
            浏览器无法代您切换输入法；本框已尽量关闭中文联想。
          </p>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          lang="en"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={STUDENT_DAHUA_CARD_LEN}
          value={cardNo}
          style={{ imeMode: "disabled" }}
          onChange={(e) => {
            if (composingRef.current) return;
            applyCardInput(e.target.value);
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            applyCardInput(e.currentTarget.value);
          }}
          onBlur={() => {
            const clean = sanitizeStudentDahuaCardNo(cardNo);
            if (clean && !isValidStudentDahuaCardNo(clean)) {
              setCardNo("");
              setInputHint(`卡号须为 ${STUDENT_DAHUA_CARD_LEN} 位字母或数字，已自动清空`);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !confirmOpen && cardReady) handleRequestConfirm();
          }}
          className="w-full rounded-xl border-2 border-white/15 bg-black/40 px-3 py-2.5 font-mono text-sm tracking-widest text-cyan-300 outline-none focus:border-cyan-400 mb-1"
          placeholder={`${STUDENT_DAHUA_CARD_LEN} 位字母或数字`}
          disabled={submitting}
          aria-invalid={cardNo.length > 0 && !cardReady}
        />
        <p className="mb-2 text-[10px] text-slate-500">
          已输入 {cardNo.length}/{STUDENT_DAHUA_CARD_LEN} 位
          {cardReady ? <span className="text-emerald-400 ml-1">· 格式正确</span> : null}
        </p>
        {inputHint ? <p className="mb-2 text-[11px] text-amber-300">{inputHint}</p> : null}

        <DahuaCardMappingStatusPanel mapping={mapping} loading={mappingLoading} compact />

        {issueResult && !issueResult.success && issueResult.steps && issueResult.steps.length > 0 ? (
          <div className="mt-2 max-h-24 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] text-rose-300">
            {issueResult.steps.map((step, idx) => (
              <div key={`${step.stepName}-${idx}`}>
                [{step.success ? "成功" : "失败"}] {step.stepName} {step.upstreamErrMsg || step.message || ""}
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-2 text-[11px] text-rose-300">{error}</p> : null}

        {!confirmOpen ? (
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-sm font-bold text-slate-300 bg-white/10 hover:bg-white/15"
              onClick={onCancel}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
              onClick={handleRequestConfirm}
              disabled={submitting || !cardReady}
            >
              确认绑卡
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 space-y-3">
            <p className="text-[12px] font-bold text-amber-100">请再次确认是否绑定以下卡号？</p>
            <p className="font-mono text-sm text-white break-all">{sanitizeStudentDahuaCardNo(cardNo)}</p>
            <DahuaCardMappingStatusPanel mapping={mapping} loading={false} compact />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 bg-white/10"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
              >
                返回修改
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
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
