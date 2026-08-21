import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import {
  answerNhpQuery,
  closeNhpQuery,
  createNhpQuery,
  fetchNhpQueries,
  type NhpQueryItem,
} from "../api/nhpRecord.api";

/** 质疑列表 + 发起/回复（持久化 crf_query + 审计）。 */
export default function NhpQueryPanel({
  recordId,
  operatorId,
  readOnly,
}: {
  recordId?: number | null;
  operatorId?: string;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<NhpQueryItem[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answerDraft, setAnswerDraft] = useState<Record<number, string>>({});

  const load = async () => {
    if (!recordId) {
      setItems([]);
      return;
    }
    try {
      setItems(await fetchNhpQueries(recordId));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  if (!recordId) return null;

  const open = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await createNhpQuery({ recordId, queryText: text.trim(), openedBy: operatorId });
      setText("");
      toast.success("已发起质疑");
      await load();
    } catch (e) {
      toast.error((e as Error).message || "发起失败");
    } finally {
      setBusy(false);
    }
  };

  const answer = async (id: number) => {
    const answerText = (answerDraft[id] || "").trim();
    if (!answerText) {
      toast.error("请填写回复");
      return;
    }
    setBusy(true);
    try {
      await answerNhpQuery(id, { answerText, answeredBy: operatorId });
      toast.success("已回复质疑");
      await load();
    } catch (e) {
      toast.error((e as Error).message || "回复失败");
    } finally {
      setBusy(false);
    }
  };

  const close = async (id: number) => {
    setBusy(true);
    try {
      await closeNhpQuery(id, { closedBy: operatorId });
      toast.success("已关闭质疑");
      await load();
    } catch (e) {
      toast.error((e as Error).message || "关闭失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nhp-query-panel">
      <div className="nhp-query-hd">数据质疑</div>
      {!readOnly && (
        <div className="nhp-query-compose">
          <textarea
            className="input"
            rows={2}
            placeholder="描述质疑内容（字段级可后续扩展 fieldId）…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" className="btn ghost small" disabled={busy || !text.trim()} onClick={open}>
            发起质疑
          </button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="aup-empty" style={{ padding: "12px 0", fontSize: 12 }}>
          暂无质疑
        </div>
      ) : (
        items.map((q) => (
          <div key={q.id} className={"nhp-query-item st-" + (q.status || "").toLowerCase()}>
            <div className="nhp-query-meta">
              <span className="tag">{statusLabel(q.status)}</span>
              <span>{formatDateTimeAsiaShanghaiShort(q.openedAt)}</span>
              {q.openedBy ? <span>· {q.openedBy}</span> : null}
            </div>
            <div className="nhp-query-text">{q.queryText}</div>
            {q.answerText && (
              <div className="nhp-query-answer">
                回复：{q.answerText}
                {q.answeredBy ? `（${q.answeredBy}）` : ""}
              </div>
            )}
            {!readOnly && q.status === "OPEN" && (
              <div className="nhp-query-compose" style={{ marginTop: 6 }}>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="回复质疑…"
                  value={answerDraft[q.id] || ""}
                  onChange={(e) => setAnswerDraft((p) => ({ ...p, [q.id]: e.target.value }))}
                />
                <button type="button" className="btn ghost small" disabled={busy} onClick={() => answer(q.id)}>
                  回复
                </button>
              </div>
            )}
            {!readOnly && q.status !== "CLOSED" && (
              <button type="button" className="btn ghost small" style={{ marginTop: 4 }} disabled={busy} onClick={() => close(q.id)}>
                关闭
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function statusLabel(s?: string): string {
  const u = (s || "").toUpperCase();
  if (u === "OPEN") return "开放";
  if (u === "ANSWERED") return "已回复";
  if (u === "CLOSED") return "已关闭";
  return s || "—";
}
