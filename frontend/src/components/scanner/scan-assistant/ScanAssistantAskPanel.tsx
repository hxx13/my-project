import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { SendHorizonal } from "lucide-react";
import type { BubblePlacement } from "./computeBubblePlacement";
import { ScanAssistantChatCard } from "./ScanAssistantChatCard";
import { streamScanAssistantAsk, streamScanAssistantGreet } from "@/api/domains/scanAssistant.api";
import { usePrefersReducedMotion, useTypewriterText } from "@/hooks/useTypewriterText";

const ASK_COOLDOWN_MS = 15_000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_KEY = "scan-assistant-ask-cache";

type AskTurn = { role: "user" | "assistant"; text: string; typed: boolean };

function loadCachedTurns(): AskTurn[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ts?: number; turns?: unknown };
    if (Date.now() - (parsed.ts ?? 0) > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return [];
    }
    if (!Array.isArray(parsed.turns)) return [];
    return parsed.turns
      .map<AskTurn>((t: any) => ({
        role: t?.role === "user" ? "user" : "assistant",
        text: String(t?.text ?? ""),
        typed: true, // 恢复的历史一律视为已打完，不重新打字
      }))
      .filter((t) => t.text.trim().length > 0); // 丢弃空回合：中断流式/问好中途缓存，避免空白气泡卡死并挡住重新问好
  } catch {
    return [];
  }
}

function saveCachedTurns(turns: AskTurn[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), turns }));
  } catch {
    /* ignore quota / private mode */
  }
}

/** 助手气泡：最新一条回答逐字打出；打完后标记 typed 避免重复打字 */
function AssistantBubble({
  text,
  type,
  onTyped,
}: {
  text: string;
  type: boolean;
  onTyped?: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const { displayed, done } = useTypewriterText(text, {
    cps: 40,
    enabled: type && !reducedMotion,
  });

  useEffect(() => {
    if (done && type) onTyped?.();
  }, [done, type, onTyped]);

  if (type && !text) {
    return (
      <div className="scan-assistant-ask__bubble scan-assistant-ask__bubble--assistant">正在思考…</div>
    );
  }
  return (
    <div className="scan-assistant-ask__bubble scan-assistant-ask__bubble--assistant">{displayed}</div>
  );
}

type ScanAssistantAskPanelProps = {
  anchorRef?: Ref<HTMLDivElement>;
  placement: BubblePlacement;
  positionStyle: CSSProperties;
  onDismiss: () => void;
};

export function ScanAssistantAskPanel({
  anchorRef,
  placement,
  positionStyle,
  onDismiss,
}: ScanAssistantAskPanelProps) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>(loadCachedTurns);
  const [sending, setSending] = useState(false);
  const lastSentAtRef = useRef(0);
  const answerCacheRef = useRef(new Map<string, string>());
  const historyRef = useRef<HTMLDivElement | null>(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  // 对话一变即持久化（而非仅卸载时）：页面刷新/切路由不触发 unmount cleanup，
  // 只靠卸载 flush 会把最近对话丢在内存里 → 刷新后"缓存丢失不显示文字"的根因。
  // 每次提交的 turns 已含加载的缓存回写，故无需单独的卸载 flush。
  useEffect(() => {
    saveCachedTurns(turns);
  }, [turns]);

  // 新消息 / 打字机增长时自动滚到底部
  useEffect(() => {
    const el = historyRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    const observer = new MutationObserver(scrollToBottom);
    observer.observe(el, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [turns.length]);

  const cooldownLeft = sending
    ? 0
    : Math.max(0, ASK_COOLDOWN_MS - (Date.now() - lastSentAtRef.current));
  const disabled = sending || cooldownLeft > 0;

  // 打开面板即触发 AI 主动问好（环境提示词 + 问好提示词），不等用户提问；恢复的历史对话则跳过
  useEffect(() => {
    if (turnsRef.current.length > 0) return;
    let cancelled = false;
    setTurns([{ role: "assistant", text: "", typed: false }]);
    let acc = "";
    void streamScanAssistantGreet({
      onDelta: (text) => {
        acc += text;
      },
      onDone: (payload) => {
        if (cancelled) return;
        const finalText = (payload.text ?? acc).trim();
        setTurns([{ role: "assistant", text: finalText, typed: false }]);
      },
      onError: (message) => {
        if (cancelled) return;
        setTurns([{ role: "assistant", text: message, typed: false }]);
      },
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    const question = draft.trim();
    if (!question || disabled) return;

    // 缓存命中：同一问题 15s 内直接回放
    const cached = answerCacheRef.current.get(question);
    if (cached != null) {
      setTurns((prev) => [
        ...prev,
        { role: "user", text: question, typed: true },
        { role: "assistant", text: cached, typed: true },
      ]);
      setDraft("");
      return;
    }

    setSending(true);
    setDraft("");
    setTurns((prev) => [
      ...prev,
      { role: "user", text: question, typed: true },
      { role: "assistant", text: "", typed: false },
    ]);

    let acc = "";
    try {
      await streamScanAssistantAsk(question, {
        onDelta: (text) => {
          acc += text;
        },
        onDone: (payload) => {
          const finalText = (payload.text ?? acc).trim();
          answerCacheRef.current.set(question, finalText);
          setTurns((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = { role: "assistant", text: finalText, typed: false };
            }
            return next;
          });
        },
        onError: (message) => {
          setTurns((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && !last.text) {
              next[next.length - 1] = { role: "assistant", text: message, typed: false };
            }
            return next;
          });
        },
      });
    } catch {
      // 错误已在 onError 兜底
    } finally {
      lastSentAtRef.current = Date.now();
      setSending(false);
    }
  };

  return (
    <div
      ref={anchorRef}
      className={["scan-assistant-bubble-anchor", `scan-assistant-bubble-anchor--${placement}`].join(" ")}
      style={positionStyle}
      /* 后台壳全局右键菜单在此放行，保证输入框能用原生粘贴 */
      data-admin-chrome-ctx-surface
    >
      <ScanAssistantChatCard
        kind="info"
        text=""
        isStreaming={false}
        isAwaitingFirstToken={false}
        isTyping={false}
        placement={placement}
        phase="entering"
        onDismiss={onDismiss}
        dismissLabel="关闭提问"
        askPanel
        footer={
          <>
            {turns.length > 0 ? (
              <div className="scan-assistant-ask__history" ref={historyRef} aria-live="polite">
                {turns.map((turn, index) => (
                  <div
                    key={index}
                    className={`scan-assistant-ask__row scan-assistant-ask__row--${turn.role}`}
                  >
                    {turn.role === "assistant" ? (
                      <AssistantBubble
                        text={turn.text}
                        type={!turn.typed}
                        onTyped={() =>
                          setTurns((prev) => {
                            const next = prev.slice();
                            const last = next[next.length - 1];
                            if (last && last.role === "assistant" && !last.typed) {
                              next[next.length - 1] = { ...last, typed: true };
                            }
                            return next;
                          })
                        }
                      />
                    ) : (
                      <div className="scan-assistant-ask__bubble scan-assistant-ask__bubble--user">
                        {turn.text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            <form
              className="scan-assistant-ask"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <input
                className="scan-assistant-ask__input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={sending ? "正在回复…" : cooldownLeft > 0 ? "稍候再问…" : "向我提问…"}
                aria-label="向智能助手提问"
                autoFocus
              />
              <button
                type="submit"
                className="scan-assistant-ask__send"
                disabled={disabled}
                aria-label="发送"
              >
                <SendHorizonal className="size-4" strokeWidth={2} />
              </button>
            </form>
          </>
        }
      />
    </div>
  );
}
