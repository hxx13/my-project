import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import {
  answerNhpQuery,
  closeNhpQuery,
  createNhpQuery,
  fetchNhpQueries,
  type NhpQueryItem,
} from "../api/nhpRecord.api";
import NhpUserRefLabel from "./NhpUserRefLabel";

type StatusFilter = "ALL" | "OPEN" | "ANSWERED" | "CLOSED";

const STATUS_META: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "待回复", tone: "open" },
  ANSWERED: { label: "已回复", tone: "answered" },
  CLOSED: { label: "已关闭", tone: "closed" },
};

/** 质疑列表 + 发起/回复（持久化 crf_query + 审计）。 */
export default function NhpQueryPanel({
  recordId,
  operatorId,
  readOnly,
  onOpenCountChange,
}: {
  recordId?: number | null;
  operatorId?: string;
  readOnly?: boolean;
  /** 开放质疑数变化时通知父级（侧栏默认展开） */
  onOpenCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<NhpQueryItem[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answerDraft, setAnswerDraft] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [expandedId, setExpandedId] = useState<number | null>(null);

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

  const counts = useMemo(() => {
    const c = { open: 0, answered: 0, closed: 0 };
    for (const q of items) {
      const s = (q.status || "").toUpperCase();
      if (s === "OPEN") c.open++;
      else if (s === "ANSWERED") c.answered++;
      else if (s === "CLOSED") c.closed++;
    }
    return c;
  }, [items]);

  useEffect(() => {
    onOpenCountChange?.(counts.open);
  }, [counts.open, onOpenCountChange]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return items;
    return items.filter((q) => (q.status || "").toUpperCase() === filter);
  }, [items, filter]);

  useEffect(() => {
    if (filtered.length === 0) {
      setExpandedId(null);
      return;
    }
    setExpandedId((prev) => {
      if (prev != null && filtered.some((q) => q.id === prev)) return prev;
      const firstOpen = filtered.find((q) => (q.status || "").toUpperCase() === "OPEN");
      return firstOpen?.id ?? filtered[0]?.id ?? null;
    });
  }, [filtered]);

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
      setAnswerDraft((p) => ({ ...p, [id]: "" }));
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

  const filterOptions: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "ALL", label: "全部", count: items.length },
    { value: "OPEN", label: "待回复", count: counts.open },
    { value: "ANSWERED", label: "已回复", count: counts.answered },
    { value: "CLOSED", label: "已关闭", count: counts.closed },
  ];

  return (
    <div className="nhp-query-panel">
      <div className="nhp-query-toolbar">
        <div className="nhp-query-stats">
          <span className="nhp-query-stat" data-tone="open">
            待回复 {counts.open}
          </span>
          <span className="nhp-query-stat" data-tone="answered">
            已回复 {counts.answered}
          </span>
        </div>
        <Link to="/nhp/review-center" className="nhp-query-review-link" title="审核中心 · 待确认 tab">
          审核中心 →
        </Link>
      </div>

      <div className="nhp-query-filters" role="tablist" aria-label="质疑状态筛选">
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={filter === opt.value}
            className={"nhp-query-filter" + (filter === opt.value ? " active" : "")}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
            {opt.count != null && opt.count > 0 ? <span className="nhp-query-filter-n">{opt.count}</span> : null}
          </button>
        ))}
      </div>

      {!readOnly && (
        <div className="nhp-query-compose">
          <textarea
            className="input"
            rows={2}
            placeholder="描述数据疑点或需澄清的内容…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" className="btn ghost small" disabled={busy || !text.trim()} onClick={open}>
            发起质疑
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="nhp-sidebar-empty compact">
          {items.length === 0 ? "暂无质疑" : "当前筛选下无记录"}
        </div>
      ) : (
        <ul className="nhp-query-list">
          {filtered.map((q) => {
            const status = (q.status || "").toUpperCase();
            const meta = STATUS_META[status] ?? { label: status || "—", tone: "default" };
            const isExpanded = expandedId === q.id;
            const canReply = !readOnly && status === "OPEN";
            const canClose = !readOnly && status !== "CLOSED";

            return (
              <li key={q.id} className={"nhp-query-card st-" + meta.tone + (isExpanded ? " is-expanded" : "")}>
                <button
                  type="button"
                  className="nhp-query-card-hd"
                  onClick={() => setExpandedId(isExpanded ? null : q.id)}
                  aria-expanded={isExpanded}
                >
                  <span className={"nhp-query-status-pill tone-" + meta.tone}>{meta.label}</span>
                  <span className="nhp-query-card-preview">{truncate(q.queryText, 48)}</span>
                  <span className="nhp-sidebar-section-chevron" aria-hidden>
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </button>

                {isExpanded ? (
                  <div className="nhp-query-card-body">
                    <div className="nhp-query-thread">
                      <div className="nhp-query-bubble nhp-query-bubble--q">
                        <div className="nhp-query-bubble-hd">
                          <span className="nhp-query-bubble-role">质疑</span>
                          <span className="nhp-query-bubble-time">{formatDateTimeAsiaShanghaiShort(q.openedAt)}</span>
                        </div>
                        <div className="nhp-query-bubble-text">{q.queryText}</div>
                        {q.openedBy ? (
                          <div className="nhp-query-bubble-who">
                            <NhpUserRefLabel name={q.openedByName} userId={q.openedBy} prefix="发起人" inline />
                          </div>
                        ) : null}
                      </div>

                      {q.answerText ? (
                        <div className="nhp-query-bubble nhp-query-bubble--a">
                          <div className="nhp-query-bubble-hd">
                            <span className="nhp-query-bubble-role">回复</span>
                            <span className="nhp-query-bubble-time">
                              {formatDateTimeAsiaShanghaiShort(q.answeredAt)}
                            </span>
                          </div>
                          <div className="nhp-query-bubble-text">{q.answerText}</div>
                          {q.answeredBy ? (
                            <div className="nhp-query-bubble-who">
                              <NhpUserRefLabel name={q.answeredByName} userId={q.answeredBy} prefix="回复人" inline />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {canReply && (
                      <div className="nhp-query-compose nhp-query-compose--inline">
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="填写澄清说明…"
                          value={answerDraft[q.id] || ""}
                          onChange={(e) => setAnswerDraft((p) => ({ ...p, [q.id]: e.target.value }))}
                        />
                        <button type="button" className="btn ghost small" disabled={busy} onClick={() => answer(q.id)}>
                          提交回复
                        </button>
                      </div>
                    )}

                    {canClose && (
                      <div className="nhp-query-card-actions">
                        <button type="button" className="btn ghost small" disabled={busy} onClick={() => close(q.id)}>
                          关闭质疑
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="nhp-query-footnote">
        质疑状态：OPEN → ANSWERED → CLOSED。审核中心「待确认」tab 汇总开放质疑，回复仍在本页完成。
      </p>
    </div>
  );
}

function truncate(s: string | undefined, n: number): string {
  const t = (s || "").trim();
  if (!t) return "—";
  return t.length > n ? t.slice(0, n) + "…" : t;
}
