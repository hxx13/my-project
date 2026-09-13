import { useEffect, useState } from "react";
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

/**
 * 确认阅读：只有一个确认按钮，答案为空对象。
 * 后端 AckReadDispositionStrategy 不做答案校验，恒通过。
 */
export function ViolationAckReadPanel({ onSubmit }: { onSubmit: SubmitDisposition }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="px-3 py-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onSubmit("{}")
            .catch((e) => toast.error(e instanceof Error ? e.message : "确认失败"))
            .finally(() => setBusy(false));
        }}
        className={PRIMARY_BTN}
      >
        {busy ? "提交中…" : "我已阅读并确认"}
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
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                  className={`rounded-[var(--app-radius-element)] border px-3 py-2 text-left text-sm ${
                    checked
                      ? "border-[var(--app-color-accent)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-primary)]"
                      : "border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]"
                  }`}
                >
                  {opt}
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
