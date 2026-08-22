/**
 * NHP 事件规则配置页（单页表格，对齐 22 §6.3 / 24 §3.6）。
 *
 * crf_event_rule：源事件类型 + 触发时机 → 下游动作（四类）。
 * 执行器 NhpEventEngine 事件入库/状态变更时查表逐条执行；前端「今日待办」统一读 crf_todo。
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  ACTION_OPTIONS,
  TRIGGER_ON_OPTIONS,
  fetchNhpEventRules,
  updateNhpEventRule,
  type NhpEventRule,
} from "../../api/nhpEventRule.api";
import "@/features/aup/aup.css";
import "../../nhp.css";

function triggerOnLabel(v: string): string {
  return TRIGGER_ON_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function actionLabel(v: string): string {
  return ACTION_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

/** 源事件 code → 中文（种子数据里的原子 code） */
const SOURCE_ATOM_LABELS: Record<string, string> = {
  SMP: "采血样本",
  MED: "给药",
  TX: "手术",
  AE: "不良事件",
  XM: "配型",
  FU: "随访",
  PATH: "活检病理",
  REG: "免疫方案",
  TST: "送检委托",
};

function sourceAtomLabel(v: string): string {
  return SOURCE_ATOM_LABELS[v] ?? v;
}

/** actionSpec JSON → 可读中文，让管理者不用读原始 JSON */
function actionSpecLabel(spec?: string | null): string {
  if (!spec) return "—";
  try {
    const o = JSON.parse(spec);
    const parts: string[] = [];
    if (o.todo_type) {
      const m: Record<string, string> = { TEST_ORDER: "送检待办", BIOPSY: "活检待办", TROUGH: "谷浓度待办" };
      parts.push(m[o.todo_type] ?? `待办：${o.todo_type}`);
    }
    if (o.schedule_anchor) {
      const m: Record<string, string> = { POST_TX: "展开术后随访", PRE_TX: "展开术前计划" };
      parts.push(m[o.schedule_anchor] ?? `展开 ${o.schedule_anchor}`);
    }
    if (o.event_atom) parts.push(`创建事件 ${o.event_atom}（加采）`);
    if (o.target_state) {
      const m: Record<string, string> = { MATCHING: "推进到配型中", POST_TX: "推进到移植后" };
      parts.push(m[o.target_state] ?? `推进到 ${o.target_state}`);
    }
    return parts.join(" · ") || spec;
  } catch {
    return spec;
  }
}

/** 文本单元格：本地草稿 + 失焦提交 */
function TextCell({ value, onCommit }: { value: string; onCommit: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        onCommit(t === "" ? null : t);
      }}
    />
  );
}

export default function NhpEventRulePage() {
  const qc = useQueryClient();
  const goBack = useGoBack("/content-manager/nhp-template");

  const rulesQuery = useQuery({ queryKey: ["nhp", "event-rules"], queryFn: fetchNhpEventRules });
  const rules = useMemo(
    () => [...(rulesQuery.data ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rulesQuery.data],
  );

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<NhpEventRule> }) => updateNhpEventRule(id, patch),
    onSuccess: () => {
      toast.success("已保存");
      void qc.invalidateQueries({ queryKey: ["nhp", "event-rules"] });
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const patch = (row: NhpEventRule, p: Partial<NhpEventRule>) => updateMut.mutate({ id: row.id, patch: p });

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>事件规则</h1>
            <div className="sub">源事件 + 触发时机 → 下游动作 · 执行器 NhpEventEngine · 待办写 crf_todo</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="aup-wb-panel">
            <div className="aup-wb-panel-hd">
              <span className="title">事件规则（crf_event_rule）</span>
              <span className="aup-wb-chip muted">共 {rules.length} 条</span>
            </div>
            <div className="aup-wb-table-wrap" style={{ marginTop: 8 }}>
              <table className="aup-wb-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>源事件</th>
                    <th style={{ width: 160 }}>触发时机</th>
                    <th style={{ width: 160 }}>触发条件</th>
                    <th style={{ width: 140 }}>动作</th>
                    <th>动作参数</th>
                    <th style={{ width: 70 }}>启用</th>
                  </tr>
                </thead>
                <tbody>
                  {rulesQuery.isError ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载失败，请刷新重试</td>
                    </tr>
                  ) : rulesQuery.isLoading ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>加载规则…</td>
                    </tr>
                  ) : rules.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>暂无事件规则</td>
                    </tr>
                  ) : (
                    rules.map((r) => (
                      <tr key={r.id}>
                        <td>{sourceAtomLabel(r.sourceAtom)}</td>
                        <td>
                          <select
                            className="select"
                            value={r.triggerOn}
                            onChange={(e) => patch(r, { triggerOn: e.target.value })}
                          >
                            {TRIGGER_ON_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <TextCell value={r.triggerCond ?? ""} onCommit={(v) => patch(r, { triggerCond: v })} />
                        </td>
                        <td>
                          <select
                            className="select"
                            value={r.action}
                            onChange={(e) => patch(r, { action: e.target.value })}
                          >
                            {ACTION_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span style={{ fontSize: 12 }}>{actionSpecLabel(r.actionSpec)}</span>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={r.active ?? true}
                            onChange={(e) => patch(r, { active: e.target.checked })}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 0 0" }}>
              动作四类：EXPAND_SCHEDULE 展开 schedule · GENERATE_TODO 写待办 · CREATE_EVENT 创建下游事件 · ADVANCE_STATE 推进状态机。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
