import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { drawViolationQuiz } from "@/api/domains/scanner.api";
import type { QuizDrawPayload } from "@/api/types/scanner";
import { SignaturePad } from "@/components/signature";

/** 提交处置答案；失败时 reject，由各面板自行提示并允许重试 */
export type SubmitDisposition = (answer: string) => Promise<void>;

const PRIMARY_BTN =
  "w-full rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-3 text-base font-medium text-white disabled:opacity-60";
const GHOST_BTN =
  "rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-2 text-sm text-[var(--app-color-text-secondary)]";

import { ackReadGateSatisfied, parseAckReadGate } from "./ackReadGate";

/**
 * 确认阅读：按钮带门控——达到「最短阅读秒数」且（若要求）正文滚到底后才可点。
 * 没配门控时与普通确认无异；配置了就必须满足，否则与「仅展示」没有区别。
 * 答案上报 {@code {dwellSeconds, scrolledToBottom}}，由后端 AckReadDispositionStrategy 复核。
 */
export function ViolationAckReadPanel({
  configJson,
  scrolledToBottom = true,
  onSubmit,
}: {
  configJson?: string | null;
  /** 正文是否已滚到底（由通知卡透传；未开启该门控时恒 true） */
  scrolledToBottom?: boolean;
  onSubmit: SubmitDisposition;
}) {
  const gate = useMemo(() => parseAckReadGate(configJson), [configJson]);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (gate.minDwellSeconds <= 0) return;
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [gate.minDwellSeconds]);

  const remaining = Math.max(0, gate.minDwellSeconds - elapsed);
  const blockedByScroll = gate.requireScrollToBottom && !scrolledToBottom;
  const canConfirm = ackReadGateSatisfied(gate, elapsed, scrolledToBottom) && !busy;
  const hint = blockedByScroll
    ? "请滑动阅读到底部后再确认"
    : remaining > 0
      ? `请继续阅读，${remaining} 秒后可确认`
      : "";

  return (
    <div className="space-y-2 px-3 py-2">
      {hint ? (
        <p className="text-center text-xs text-[var(--app-color-text-tertiary)]">{hint}</p>
      ) : null}
      <button
        type="button"
        disabled={!canConfirm}
        onClick={() => {
          setBusy(true);
          void onSubmit(
            JSON.stringify({
              dwellSeconds: elapsed,
              scrolledToBottom: gate.requireScrollToBottom ? scrolledToBottom : true,
            })
          )
            .catch((e) => toast.error(e instanceof Error ? e.message : "确认失败"))
            .finally(() => setBusy(false));
        }}
        className={PRIMARY_BTN}
      >
        {busy ? "提交中…" : remaining > 0 ? `我已阅读并确认（${remaining}s）` : "我已阅读并确认"}
      </button>
    </div>
  );
}

/**
 * 答题：挂载即抽题，单选作答，答满才可提交。
 * 抽题不落库，答案由后端 QuizGradeSupport 判分。
 */
export function ViolationQuizPanel({
  violationId,
  onSubmit,
}: {
  violationId: number;
  onSubmit: SubmitDisposition;
}) {
  const [draw, setDraw] = useState<QuizDrawPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const d = await drawViolationQuiz(violationId);
        if (cancelled) return;
        setErr(null);
        setAnswers({});
        setDraw(d);
      } catch (e) {
        if (cancelled) return;
        setDraw(null);
        setErr(e instanceof Error ? e.message : "抽题失败");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [violationId, reloadKey]);

  if (err) {
    return (
      <div className="space-y-2 px-3 py-2 text-center">
        <p className="text-sm text-[var(--app-color-feedback-danger)]">{err}</p>
        <button
          type="button"
          onClick={() => {
            setErr(null);
            setReloadKey((k) => k + 1);
          }}
          className={GHOST_BTN}
        >
          重新抽题
        </button>
      </div>
    );
  }

  if (!draw) {
    return (
      <p className="px-3 py-2 text-center text-sm text-[var(--app-color-text-tertiary)]">正在抽题…</p>
    );
  }

  if (draw.questions.length === 0) {
    return (
      <p className="px-3 py-2 text-center text-sm text-[var(--app-color-text-tertiary)]">
        该试卷暂无题目，请联系管理员
      </p>
    );
  }

  const answeredAll = draw.questions.every((q) => answers[q.id] != null);

  return (
    <div className="space-y-3 px-3 py-2">
      {draw.questions.map((q, qi) => (
        <div key={q.id} className="space-y-1.5">
          <p className="text-sm font-medium text-[var(--app-color-text-primary)]">
            {qi + 1}. {q.prompt}
          </p>
          <div className="flex flex-col gap-1.5">
            {q.options.map((opt, idx) => {
              const checked = answers[q.id] === idx;
              return (
                <button
                  key={`${q.id}-${idx}`}
                  type="button"
                  disabled={busy}
                  aria-pressed={checked}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                  className={`flex items-center gap-2.5 rounded-[var(--app-radius-element)] border-2 px-3 py-2.5 text-left text-sm transition-colors ${
                    checked
                      ? // 选中态要一眼看得出来：2px 主色描边 + 主色浅底 + 实心勾选圆点 + 加粗
                        "border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] font-medium text-[var(--app-color-text-primary)]"
                      : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      checked
                        ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-white"
                        : "border-[var(--app-color-border-default)]"
                    }`}
                  >
                    {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={busy || !answeredAll}
        onClick={() => {
          setBusy(true);
          void onSubmit(JSON.stringify({ answers }))
            .catch((e) => toast.error(e instanceof Error ? e.message : "未及格或提交失败"))
            .finally(() => setBusy(false));
        }}
        className={PRIMARY_BTN}
      >
        {busy ? "提交中…" : "提交答卷"}
      </button>
    </div>
  );
}

/** 签名确认：手写签名，无笔迹不可提交，答案带 dataUrl。 */
export function ViolationSignaturePanel({
  preamble,
  onSubmit,
}: {
  preamble?: string;
  onSubmit: SubmitDisposition;
}) {
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 px-3 py-2">
      {preamble ? (
        <p className="text-sm text-[var(--app-color-text-secondary)]">{preamble}</p>
      ) : null}
      <SignaturePad value={sig} onChange={setSig} disabled={busy} height={200} />
      <button
        type="button"
        disabled={busy || !sig}
        onClick={() => {
          setBusy(true);
          void onSubmit(JSON.stringify({ signature: sig }))
            .catch((e) => toast.error(e instanceof Error ? e.message : "签名提交失败"))
            .finally(() => setBusy(false));
        }}
        className={PRIMARY_BTN}
      >
        {busy ? "提交中…" : "签名确认"}
      </button>
    </div>
  );
}
