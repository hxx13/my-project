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
        // correct
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
        // wrong — flash & reset
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
      // allow esc
      if (e.key === "Escape") return;
      // prevent typing shortcuts
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done]);

  const targetPhrase = phrase;
  const progress = done ? chars.length : nextIdx;
  const allDone = done;

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-xl mx-auto">
      {/* instruction */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <p className="text-sm font-bold text-amber-100">
          请按顺序点击下列文字
        </p>
        <p className="text-base font-black tracking-[0.15em] text-amber-200">
          {targetPhrase}
        </p>
      </div>

      {/* progress bar */}
      <div className="flex items-center gap-2 w-full max-w-[280px]">
        <div className="flex-1 h-1.5 rounded-full bg-amber-500/20 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(progress / chars.length) * 100}%`,
              background: allDone
                ? "linear-gradient(90deg, #22c55e, #16a34a)"
                : errorFlash
                  ? "#ef4444"
                  : "linear-gradient(90deg, #f59e0b, #fbbf24)",
            }}
          />
        </div>
        <span className="text-[11px] font-bold text-amber-200/70 tabular-nums">
          {progress}/{chars.length}
        </span>
      </div>

      {/* shuffled cards */}
      <div
        className={`flex flex-wrap justify-center gap-2 transition-all duration-200 ${
          errorFlash ? "animate-[shake_0.4s_ease-in-out]" : ""
        }`}
      >
        {shuffled.map((item, pos) => {
          const isClicked = clicked.has(pos);
          const isCorrectSlot = item.index < nextIdx;
          return (
            <button
              key={pos}
              type="button"
              disabled={done || isClicked}
              onClick={() => handleClick(item, pos)}
              className={`
                flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-black
                transition-all duration-150 select-none
                ${isClicked
                  ? "border-green-500/60 bg-green-500/20 text-green-300 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                  : done
                    ? "border-amber-500/20 bg-amber-500/5 text-amber-300/40"
                    : errorFlash
                      ? "border-red-500/60 bg-red-500/15 text-red-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 hover:border-amber-400/60 active:scale-95"
                }
              `}
            >
              {item.char}
            </button>
          );
        })}
      </div>

      {/* completion indicator */}
      {allDone && (
        <div className="flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/15 px-4 py-1.5 animate-in fade-in zoom-in">
          <Check className="h-4 w-4 text-green-400" />
          <span className="text-xs font-bold text-green-300">验证通过</span>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
