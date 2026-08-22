import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import toast from "react-hot-toast";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { InteractiveChallenge } from "@/components/scanner/InteractiveChallenge";
import { prepareAnnouncementHtml } from "@/utils/announcementHtml";
import {
  completeObligation,
  drawObligationQuiz,
  fetchMyObligations,
  markObligationDelivered,
  type QuizDrawPayload,
  type StudentObligationRow,
} from "../api/student.api";
import { EmptyState, ErrorRetry, Skeleton, StudentButton } from "../components/ui";

/**
 * 期 4 · H5 处置页：按 dispositionType 渲染拼图 / 答题 / 确认阅读 / 签名；
 * GUIDE_ONLY 时展示跳转引导。
 */
export default function StudentObligationsPage() {
  const [params] = useSearchParams();
  const focusId = Number(params.get("focus") || 0);
  const [rows, setRows] = useState<StudentObligationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(focusId > 0 ? focusId : null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchMyObligations({ status: "PENDING_DISPOSITION", channel: "H5" });
      setRows(list);
      if (focusId > 0 && list.some((r) => r.id === focusId)) {
        setActiveId(focusId);
      } else if (!activeId && list.length > 0) {
        setActiveId(list[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [focusId, activeId]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(() => rows.find((r) => r.id === activeId) ?? null, [rows, activeId]);

  useEffect(() => {
    if (active?.id) {
      void markObligationDelivered(active.id).catch(() => undefined);
    }
  }, [active?.id]);

  return (
    <AdminPageShell title="待办确认" description="完成违规确认、公告阅读或答题后即可解除限制。">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <ErrorRetry message={error} onRetry={() => void reload()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="暂无待办" description="当前没有需要确认的事项。" />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setActiveId(r.id)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    r.id === activeId
                      ? "bg-[var(--student-primary)] text-white"
                      : "bg-[var(--student-surface)] text-[var(--student-mute-foreground)]"
                  }`}
                >
                  {r.title || `待办 #${r.id}`}
                </button>
              ))}
            </div>
            {active ? (
              <ObligationDispositionPanel
                row={active}
                onCompleted={async () => {
                  toast.success("已完成确认");
                  await reload();
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </AdminPageShell>
  );
}

function ObligationDispositionPanel({
  row,
  onCompleted,
}: {
  row: StudentObligationRow;
  onCompleted: () => void | Promise<void>;
}) {
  if (row.deliveryMode === "GUIDE_ONLY") {
    return (
      <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--student-surface)] p-4">
        <p className="text-sm text-[var(--student-mute-foreground)]">
          {row.guideMessage || "请前往互动渠道完成确认"}
        </p>
        {row.redirectPath ? (
          <a
            href={`#${row.redirectPath}`}
            className="mt-3 inline-flex text-sm text-[var(--student-primary)] underline"
          >
            前往完成
          </a>
        ) : null}
      </div>
    );
  }

  const type = (row.dispositionType || "SHOW_ONLY").toUpperCase();

  return (
    <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--student-surface)] p-4">
      <h2 className="text-lg font-semibold text-[var(--student-foreground)]">{row.title}</h2>
      {row.contentHtml ? (
        <div
          className="prose prose-sm mt-3 max-w-none rich-text-content text-[var(--student-foreground)]"
          dangerouslySetInnerHTML={{ __html: prepareAnnouncementHtml(row.contentHtml) }}
        />
      ) : null}

      {type === "SHOW_ONLY" || type === "ACK_READ" ? (
        <AckReadPanel
          onSubmit={async () => {
            await completeObligation(row.id, "{}", "H5");
            await onCompleted();
          }}
        />
      ) : null}

      {type === "ACK_PUZZLE" ? (
        <PuzzlePanel
          configJson={row.dispositionConfigJson}
          onSubmit={async (answer) => {
            await completeObligation(row.id, answer, "H5");
            await onCompleted();
          }}
        />
      ) : null}

      {type === "QUIZ" ? (
        <QuizPanel
          obligationId={row.id}
          onSubmit={async (answerJson) => {
            await completeObligation(row.id, answerJson, "H5");
            await onCompleted();
          }}
        />
      ) : null}

      {type === "SIGNATURE" ? (
        <SignaturePanel
          configJson={row.dispositionConfigJson}
          onSubmit={async (signature) => {
            await completeObligation(row.id, JSON.stringify({ signature }), "H5");
            await onCompleted();
          }}
        />
      ) : null}
    </div>
  );
}

function AckReadPanel({ onSubmit }: { onSubmit: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4">
      <StudentButton
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "提交失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "提交中…" : "我已阅读并确认"}
      </StudentButton>
    </div>
  );
}

function PuzzlePanel({
  configJson,
  onSubmit,
}: {
  configJson?: string | null;
  onSubmit: (answer: string) => Promise<void>;
}) {
  let phrase = "";
  try {
    if (configJson) {
      const cfg = JSON.parse(configJson) as { phrase?: string };
      phrase = cfg.phrase ?? "";
    }
  } catch {
    /* ignore */
  }
  if (!phrase) {
    return <p className="mt-4 text-sm text-[var(--student-mute-foreground)]">缺少拼图短语配置</p>;
  }
  return (
    <div className="mt-4">
      <InteractiveChallenge
        phrase={phrase}
        onComplete={async (answer) => {
          try {
            await onSubmit(answer);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "确认失败");
            throw e;
          }
        }}
      />
    </div>
  );
}

function QuizPanel({
  obligationId,
  onSubmit,
}: {
  obligationId: number;
  onSubmit: (answerJson: string) => Promise<void>;
}) {
  const [draw, setDraw] = useState<QuizDrawPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    drawObligationQuiz(obligationId)
      .then((d) => {
        if (!cancelled) setDraw(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "抽题失败");
      });
    return () => {
      cancelled = true;
    };
  }, [obligationId]);

  if (err) return <p className="mt-4 text-sm text-[var(--student-error)]">{err}</p>;
  if (!draw) return <Skeleton className="mt-4 h-32 w-full" />;

  return (
    <div className="mt-4 space-y-4">
      {draw.questions.map((q) => (
        <div key={q.id} className="space-y-2">
          <p className="text-sm font-medium">{q.prompt}</p>
          <div className="flex flex-col gap-1">
            {q.options.map((opt, idx) => (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  checked={answers[q.id] === idx}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      ))}
      <StudentButton
        disabled={busy || Object.keys(answers).length < draw.questions.length}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit(JSON.stringify({ answers }));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "未及格或提交失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "提交中…" : "提交答卷"}
      </StudentButton>
    </div>
  );
}

function SignaturePanel({
  configJson,
  onSubmit,
}: {
  configJson?: string | null;
  onSubmit: (signature: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  let preamble = "";
  try {
    if (configJson) {
      preamble = (JSON.parse(configJson) as { preamble?: string }).preamble ?? "";
    }
  } catch {
    /* ignore */
  }
  return (
    <div className="mt-4 space-y-3">
      {preamble ? <p className="text-sm text-[var(--student-mute-foreground)]">{preamble}</p> : null}
      <input
        className="w-full rounded-md border border-[var(--app-color-border-default)] px-3 py-2 text-sm"
        placeholder="请输入姓名作为签名"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <StudentButton
        disabled={busy || name.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit(name.trim());
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "签名提交失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "提交中…" : "签名确认"}
      </StudentButton>
    </div>
  );
}
