import { useCallback, useEffect, useState } from "react";
import {
  addMyPreference,
  deleteMyPreference,
  fetchMyPreferences,
  type MyPreference,
} from "@/api/domains/scanAssistant.api";

/**
 * 我的偏好 —— **看得见、改得了**。
 *
 * <h2>为什么必须有这一页</h2>
 * 设计里原本只给了「在对话里问一句」这条路。但那样用户**根本不知道助手记了什么** ——
 * 知情权不能只靠他想得起来问。这一页是「写入时当场明说」之外的第三条腿：
 * 随时翻得到、还能直接改。
 *
 * <p>与「对话是最快的控制入口」不冲突：说得出来的用对话，说不清/想看全的来这里。
 *
 * <h2>改一条 = 先删后加</h2>
 * 表上的唯一键是「人 + 内容」，所以改文字没有「原地更新」这回事 ——
 * 删除旧的那条再写入新的。对用户是「改」，对库是两笔，这是**有意的**：
 * 唯一键保证同一个人不会记两条一模一样的偏好。
 */
export function ScanAssistantPreferenceView({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<MyPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** 正在改的那几条：id → 输入框里的当前文字 */
  const [editing, setEditing] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setRows(await fetchMyPreferences());
      setEditing({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    const c = draft.trim();
    if (!c || busy) return;
    setBusy(true);
    setErr("");
    try {
      await addMyPreference(c);
      setDraft("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (content: string) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      await deleteMyPreference(content);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "删不掉");
    } finally {
      setBusy(false);
    }
  };

  /** 改一条：先删旧的、再加新的（唯一键是「人 + 内容」，没有原地更新）。 */
  const save = async (oldContent: string, nextContent: string) => {
    const next = nextContent.trim();
    if (busy || !next || next === oldContent) return;
    setBusy(true);
    setErr("");
    try {
      await addMyPreference(next);
      await deleteMyPreference(oldContent);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "改不了");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scan-assistant-ask__pref">
      <div className="scan-assistant-ask__pref-head">
        <button type="button" className="scan-assistant-ask__pref-back" onClick={onBack}>
          ← 回到对话
        </button>
      </div>
      <p className="scan-assistant-ask__pref-tip">
        这些是助手记住的习惯，只对你一个人生效。也可以直接在对话里说「记住…」「别记这个」。
      </p>

      <div className="scan-assistant-ask__pref-add">
        <input
          className="scan-assistant-ask__edit-input"
          value={draft}
          placeholder="加一条，例如：导出订购单固定保留两级小计"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button
          type="button"
          className="scan-assistant-ask__pref-btn"
          disabled={busy || draft.trim().length === 0}
          onClick={() => void add()}
        >
          添加
        </button>
      </div>

      {err ? <div className="scan-assistant-ask__pref-err">{err}</div> : null}
      {loading ? <div className="scan-assistant-ask__detail-empty">读取中…</div> : null}
      {!loading && rows.length === 0 ? (
        <div className="scan-assistant-ask__detail-empty">还没记过任何习惯</div>
      ) : null}

      {rows.map((r) => {
        const cur = editing[r.id];
        const changed = cur !== undefined && cur.trim() !== r.content.trim();
        return (
          <div className="scan-assistant-ask__edit-card" key={r.id}>
            <div className="scan-assistant-ask__edit-row">
              <input
                className="scan-assistant-ask__edit-input"
                value={cur ?? r.content}
                onChange={(e) => setEditing((p) => ({ ...p, [r.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && changed) void save(r.content, cur);
                }}
              />
              {changed ? (
                <button
                  type="button"
                  className="scan-assistant-ask__pref-btn"
                  disabled={busy}
                  onClick={() => void save(r.content, cur)}
                >
                  保存
                </button>
              ) : null}
              <button
                type="button"
                className="scan-assistant-ask__pref-del"
                disabled={busy}
                onClick={() => void remove(r.content)}
              >
                删掉
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
