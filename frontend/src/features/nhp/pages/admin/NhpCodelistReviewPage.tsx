/**
 * NHP 码表审核页（item 级 verdict + 版本冻结，对齐 22 §6.5 / 24 §3.7）。
 *
 * 左列表选码表，右侧逐项给 verdict（确认/需修改/建议删除/有疑问）+ 意见，冻结走版本流程。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { fetchNhpCodelists, type NhpCodelist } from "../../api/nhpCodelist.api";
import {
  fetchNhpCodelistReviewItems,
  freezeNhpCodelist,
  submitNhpCodelistItemVerdict,
} from "../../api/nhpCodelistReview.api";
import { VERDICT_OPTIONS, verdictLabel } from "../../schema/verdict";
import { appConfirm } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "../../nhp.css";

export default function NhpCodelistReviewPage() {
  const qc = useQueryClient();
  const goBack = useGoBack("/content-manager/nhp-template");
  const [selected, setSelected] = useState<string | null>(null);

  const listQuery = useQuery({ queryKey: ["nhp", "codelists"], queryFn: fetchNhpCodelists });
  const codelists = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  useEffect(() => {
    if (codelists.length && (selected == null || !codelists.some((c) => c.code === selected))) {
      setSelected(codelists[0].code);
    }
  }, [codelists, selected]);

  const itemsQuery = useQuery({
    queryKey: ["nhp", "codelist-review-items", selected],
    queryFn: () => fetchNhpCodelistReviewItems(selected!),
    enabled: !!selected,
  });
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  const verdictMut = useMutation({
    mutationFn: ({ itemId, verdict, verdictNote }: { itemId: number; verdict: string; verdictNote?: string }) =>
      submitNhpCodelistItemVerdict(selected!, itemId, { verdict, verdictNote }),
    onSuccess: () => {
      toast.success("已记录审核意见");
      void qc.invalidateQueries({ queryKey: ["nhp", "codelist-review-items", selected] });
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });

  const freezeMut = useMutation({
    mutationFn: () => freezeNhpCodelist(selected!),
    onSuccess: () => {
      toast.success("已冻结");
      void qc.invalidateQueries({ queryKey: ["nhp", "codelists"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "codelist-review-items", selected] });
    },
    onError: (e: Error) => toast.error(e.message || "冻结失败"),
  });

  const verdictTone = (v?: string | null): string => {
    switch (v) {
      case "MODIFY":
        return "var(--warn)";
      case "DELETE":
        return "var(--danger)";
      case "QUESTION":
        return "#7C3AED";
      default:
        return "var(--success)";
    }
  };

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>码表审核</h1>
            <div className="sub">item 级四态校对 + 版本冻结（冻结后禁止直接改取值）</div>
          </div>
        </div>

        <div className="aup-wb-split">
          <aside className="aup-wb-aside">
            {listQuery.isLoading && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载码表…</div>
            )}
            {listQuery.isError && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载失败，请刷新重试</div>
            )}
            {!listQuery.isLoading && !listQuery.isError && codelists.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>暂无码表</div>
            )}
            {codelists.map((c: NhpCodelist) => (
              <div
                key={c.code}
                className={`aup-wb-row${selected === c.code ? " on" : ""}`}
                style={{ paddingLeft: 14 }}
                onClick={() => setSelected(c.code)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lbl">{c.name}</div>
                  <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                    {c.code} · v{c.version}
                  </div>
                </div>
              </div>
            ))}
          </aside>

          <div className="aup-wb-main">
            {!selected ? (
              <div className="aup-wb-empty">选左侧码表逐项审核</div>
            ) : (
              <div className="aup-wb-panel">
                <div className="aup-wb-panel-hd">
                  <span className="title">逐项审核（{selected}）</span>
                  <span className="aup-wb-chip muted">{items.length} 项</span>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={freezeMut.isPending}
                    onClick={async () => {
                      if (await appConfirm(`冻结码表「${selected}」？冻结后取值禁止直接改，变更走新版本。`)) freezeMut.mutate();
                    }}
                  >
                    冻结
                  </button>
                </div>
                <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
                  <table className="aup-wb-table">
                    <thead>
                      <tr>
                        <th style={{ width: 140 }}>item_code</th>
                        <th>item_label</th>
                        <th style={{ width: 130 }}>审核态</th>
                        <th>意见</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itemsQuery.isError ? (
                        <tr><td colSpan={4} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</td></tr>
                      ) : itemsQuery.isLoading ? (
                        <tr><td colSpan={4} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载项…</td></tr>
                      ) : items.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>暂无字典项</td></tr>
                      ) : (
                        items.map((it) => (
                          <tr key={it.id}>
                            <td className="mono">{it.itemCode}</td>
                            <td>{it.itemLabel}</td>
                            <td>
                              <select
                                className="select"
                                value={it.verdict ?? ""}
                                onChange={(e) => verdictMut.mutate({ itemId: it.id, verdict: e.target.value })}
                              >
                                <option value="">待校对</option>
                                {VERDICT_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <span style={{ fontSize: 12, color: verdictTone(it.verdict) }}>{verdictLabel(it.verdict)}</span>
                              {it.verdictNote ? <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>{it.verdictNote}</span> : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
