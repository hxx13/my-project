import { useMemo, useState, useCallback, useEffect } from "react";
import { Check, AlertTriangle } from "lucide-react";

type Props = {
  phrase: string;
  onComplete: () => void;
};

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 交互式违规确认拼图：将短语拆为单字卡片，随机排列；
 * 用户须按正确顺序逐一点击，全部正确后触发 onComplete。
 */
export function InteractiveChallenge({ phrase, onComplete }: Props) {
  const chars: { char: string; index: number }[] = useMemo(
    () => [...phrase].map((char, index) => ({ char, index })),
    [phrase]
  );

  const [shuffled] = useState(() => shuffle(chars));
  const [nextIdx, setNextIdx] = useState(0);
  const [errorFlash, setErrorFlash] = useState(false);
  const [done, setDone] = useState(false);
  const [clicked, setClicked] = useState<Set<number>>(new Set());

  const handleClick = useCallback(
    (item: { char: string; index: number }, pos: number) => {
      if (done) return;
      if (item.index === nextIdx) {
        const newClicked = new Set(clicked);
        newClicked.add(pos);
        setClicked(newClicked);
        const next = nextIdx + 1;
        setNextIdx(next);
        if (next >= chars.length) {
          setDone(true);
          setTimeout(onComplete, 400);
        }
      } else {
        setErrorFlash(true);
        setNextIdx(0);
        setClicked(new Set());
        setTimeout(() => setErrorFlash(false), 600);
      }
    },
    [nextIdx, done, clicked, chars.length, onComplete]
  );

  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done]);

  const targetPhrase = phrase;
  const progress = done ? chars.length : nextIdx;
  const allDone = done;

  const progressFill = allDone
    ? "var(--app-color-feedback-success)"
    : errorFlash
      ? "var(--app-color-feedback-danger)"
      : "var(--app-color-feedback-warning)";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <AlertTriangle className="h-5 w-5 text-[var(--app-color-feedback-warning)]" />
        <p className="text-sm font-bold text-[var(--app-color-text-primary)]">
          请按顺序点击下列文字
        </p>
        <p className="text-base font-black tracking-[0.15em] text-[var(--app-color-feedback-warning)]">
          {targetPhrase}
        </p>
      </div>

      <div className="flex w-full max-w-[280px] items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--app-color-feedback-warning-soft)]">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(progress / chars.length) * 100}%`,
              backgroundColor: progressFill,
            }}
          />
        </div>
        <span className="text-[11px] font-bold tabular-nums text-[var(--app-color-text-tertiary)]">
          {progress}/{chars.length}
        </span>
      </div>

      <div
        className={`flex flex-wrap justify-center gap-2 transition-all duration-200 ${
          errorFlash ? "animate-[shake_0.4s_ease-in-out]" : ""
        }`}
      >
        {shuffled.map((item, pos) => {
          const isClicked = clicked.has(pos);
          return (
            <button
              key={pos}
              type="button"
              disabled={done || isClicked}
              onClick={() => handleClick(item, pos)}
              className={`
                flex h-11 w-11 select-none items-center justify-center rounded-[var(--app-radius-element)] border text-lg font-black
                transition-all duration-150
                ${isClicked
                  ? "border-[var(--app-color-feedback-success)]/60 bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]"
                  : done
                    ? "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]"
                    : errorFlash
                      ? "border-[var(--app-color-feedback-danger)]/60 bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]"
                      : "border-[var(--app-color-feedback-warning)]/40 bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-text-primary)] hover:border-[var(--app-color-feedback-warning)]/60 hover:bg-[var(--app-color-feedback-warning-soft)] active:scale-95"
                }
              `}
            >
              {item.char}
            </button>
          );
        })}
      </div>

      {allDone ? (
        <div className="flex animate-in fade-in zoom-in items-center gap-2 rounded-full border border-[var(--app-color-feedback-success)]/40 bg-[var(--app-color-feedback-success-soft)] px-4 py-1.5">
          <Check className="h-4 w-4 text-[var(--app-color-feedback-success)]" />
          <span className="text-xs font-bold text-[var(--app-color-feedback-success)]">验证通过</span>
        </div>
      ) : null}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
