import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchCageHistory, type CageHistoryEvent, type CageHistoryView } from "@/api/domains/cageShelf.api";
import { fetchCageTemplate, type CageTemplateDetail } from "../api/cageForm.api";
import { flattenFields } from "./CageFormFill";
import { CAGE_FORM_KEY } from "../cageFormConstants";

type FieldRef = { canonical: string; label: string };
type ChangeRow = { canonical?: string | null; label?: string | null; before?: string | null; after?: string | null };

function fmt(s?: string | null): string {
  return s ? s.replace("T", " ").substring(0, 16) : "—";
}

/** 审计落库的布尔是字面量 "true"/"false"，其余值写库时已是可读文本。空值单独返回 null 好让调用方显式标注。 */
function show(v?: string | null): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v === "true") return "是";
  if (v === "false") return "否";
  return v;
}

const CHANGE_TYPE_LABEL: Record<string, string> = {
  UPDATE: "字段修改",
  TRANSFER: "转移笼位",
  TRANSFER_OUT: "转出到其他笼位",
  COPY: "复制占用",
  DIVIDE: "分笼",
  INHERIT: "分笼继承",
  BIND: "绑定笼盒",
  UNBIND: "解绑笼盒",
  ARCHIVE: "归档",
  EXIT: "退出",
  UNALLOCATE: "取消分配",
};

const KIND_META: Record<string, { label: string; tone: string; dot: string }> = {
  IN: { label: "值迁入", tone: "ok", dot: "var(--app-color-feedback-success)" },
  OUT: { label: "值清出", tone: "bad", dot: "var(--app-color-feedback-danger)" },
  EDIT: { label: "原地编辑", tone: "none", dot: "var(--app-color-border-strong)" },
};

const isNoop = (c: ChangeRow) => (c.before ?? "") === (c.after ?? "");

/** 单条变更：旧值弱化划掉 → 新值强调；清空显式写「（清空）」而不是留白。 */
function DiffLine({ label, before, after }: { label: string; before?: string | null; after?: string | null }) {
  const b = show(before);
  const a = show(after);
  return (
    <div className="flex min-w-0 items-baseline gap-2 text-[12px] leading-5">
      <span className="w-[76px] shrink-0 truncate text-[var(--app-color-text-tertiary)]" title={label}>
        {label}
      </span>
      <span
        className={`min-w-0 break-all ${
          b === null
            ? "text-[var(--app-color-text-tertiary)]"
            : "text-[var(--app-color-text-tertiary)] line-through decoration-1"
        }`}
      >
        {b ?? "（空）"}
      </span>
      <span className="shrink-0 text-[var(--app-color-text-tertiary)]">→</span>
      <span className="min-w-0 break-all font-medium text-[var(--app-color-text-primary)]">{a ?? "（清空）"}</span>
    </div>
  );
}

/** 一个小节标题条：分区之间靠它分层，不靠加大留白。 */
function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--app-color-text-secondary)]"
      // surface-hover 是暖色，当条底会发浑；用与斑马纹同源的 neutral 叠加
      style={{ background: "color-mix(in srgb, var(--app-color-text-primary) 4%, transparent)" }}
    >
      {children}
    </div>
  );
}

/** 字段点开后的变更台账：时间 / 操作人 / 前后值。 */
function FieldLedger({ rows }: { rows: Array<{ at?: string | null; operator?: string | null; before?: string | null; after?: string | null }> }) {
  return (
    <div className="space-y-1.5 border-l-2 border-[var(--app-color-border-default)] pl-3 ml-3 pb-2">
      {rows.map((h, i) => (
        <div key={i}>
          <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--app-color-text-tertiary)]">
            <span className="tabular-nums">{fmt(h.at)}</span>
            {h.operator && <span>{h.operator}</span>}
          </div>
          <DiffLine label="变更" before={h.before} after={h.after} />
        </div>
      ))}
    </div>
  );
}

/**
 * 结构变更节点：变更前表单 → 变更后表单。
 * 只列前后有差异的字段（未受影响的字段在这张对比图里是噪声）。
 */
function MigrationBody({ changes, labels }: { changes: ChangeRow[]; labels: Record<string, string> }) {
  const changed = changes.filter((c) => !isNoop(c));
  const labelOf = (c: ChangeRow) => labels[c.canonical ?? ""] ?? c.label ?? c.canonical ?? "—";

  const panel = (side: "before" | "after") => (
    <div
      className={`min-w-0 flex-1 rounded-[10px] border px-3 py-2 ${
        side === "after"
          ? "border-[var(--app-color-border-strong)]"
          : "border-[var(--app-color-border-default)]"
      }`}
      // surface-hover 在这套主题里是暖色，当大块面板底色会发浑；用与斑马纹同源的 neutral 叠加
      style={
        side === "after"
          ? { background: "color-mix(in srgb, var(--app-color-text-primary) 5%, transparent)" }
          : undefined
      }
    >
      <div className="mb-1.5 text-[11px] font-semibold text-[var(--app-color-text-secondary)]">
        {side === "before" ? "变更前" : "变更后"}
      </div>
      <div className="space-y-1">
        {changed.map((c, i) => {
          const v = show(side === "before" ? c.before : c.after);
          return (
            <div key={`${c.canonical}-${i}`} className="text-[12px] leading-5">
              <div className="text-[11px] text-[var(--app-color-text-tertiary)]">{labelOf(c)}</div>
              <div
                className={`break-all ${
                  v === null
                    ? "text-[var(--app-color-text-tertiary)]"
                    : side === "after"
                      ? "font-semibold text-[var(--app-color-text-primary)]"
                      : "text-[var(--app-color-text-secondary)]"
                }`}
              >
                {v ?? "（空）"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center">
      {panel("before")}
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full border border-[var(--app-color-border-default)] text-[13px] leading-none text-[var(--app-color-text-tertiary)]"
        aria-hidden
      >
        <span className="max-sm:hidden">→</span>
        <span className="sm:hidden">↓</span>
      </div>
      {panel("after")}
    </div>
  );
}

/** 时间轴上的一个节点：左侧轨道圆点 + 事件卡片（色条按类型着色）。 */
function TimelineNode({
  event,
  labels,
  first,
  last,
}: {
  event: CageHistoryEvent;
  labels: Record<string, string>;
  first: boolean;
  last: boolean;
}) {
  const meta = KIND_META[event.kind] ?? KIND_META.EDIT;
  const changed = event.changes.filter((c) => !isNoop(c));
  const labelOf = (c: ChangeRow) => labels[c.canonical ?? ""] ?? c.label ?? c.canonical ?? "—";

  return (
    <div className="relative pl-5">
      {/* 轨道：首节点不画上半段，末节点不画下半段 */}
      <span
        className="absolute left-[4px] w-px bg-[var(--app-color-border-default)]"
        style={{ top: first ? 14 : 0, bottom: last ? "auto" : 0, height: last ? 0 : undefined }}
      />
      <span
        className="absolute left-0 top-[9px] h-[9px] w-[9px] rounded-full ring-2 ring-[var(--app-color-surface-container)]"
        style={{ background: meta.dot }}
      />
      <div className="review-card mb-3" data-tone={meta.tone}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2">
          <span className="text-[12px] font-semibold text-[var(--app-color-text-primary)]">{meta.label}</span>
          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
            {CHANGE_TYPE_LABEL[event.changeType] ?? event.changeType}
          </span>
          <span className="ml-auto text-[11px] tabular-nums text-[var(--app-color-text-tertiary)]">{fmt(event.at)}</span>
          {event.operator && (
            <span className="text-[11px] text-[var(--app-color-text-secondary)]">{event.operator}</span>
          )}
        </div>

        <div className="border-t border-[var(--app-color-border-default)] px-3 py-2">
          {changed.length === 0 ? (
            <div className="text-[12px] text-[var(--app-color-text-tertiary)]">无字段变化</div>
          ) : event.kind === "EDIT" ? (
            <div className="space-y-1">
              {changed.map((c, i) => (
                <DiffLine key={i} label={labelOf(c)} before={c.before} after={c.after} />
              ))}
            </div>
          ) : (
            <MigrationBody changes={event.changes} labels={labels} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 「记录模式」下点笼位弹出的变更历史。
 *
 * 数据源 = cage_form_audit_log（同一套留痕，笼位切面）。后端按 changeType + 秒级时间聚合成事件，
 * 并附每事件的整表快照：
 *   · 全程只有就地编辑 → 按详情弹窗的表单形式渲染，字段可点开看自己的变更台账
 *   · 出现过结构性变更（空→有 / 由他笼转移而来 / 归档清出）→ 时间轴，每次迁移画「变更前表单 → 变更后表单」
 */
export default function CageHistoryModal({ animalCageId, onClose }: { animalCageId: string | null; onClose: () => void }) {
  const [view, setView] = useState<CageHistoryView | null>(null);
  const [template, setTemplate] = useState<CageTemplateDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openField, setOpenField] = useState<string | null>(null);

  useEffect(() => {
    if (!animalCageId) {
      setView(null);
      setError("");
      setOpenField(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    setOpenField(null);
    void fetchCageHistory(animalCageId)
      .then((v) => { if (!cancelled) setView(v); })
      .catch((e) => { if (!cancelled) { setView(null); setError(e instanceof Error ? e.message : "加载失败"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [animalCageId]);

  // 模板只用来拿字段顺序、分组与展示名；拿不到就退回审计里记的字段名
  useEffect(() => {
    if (!animalCageId) return;
    let cancelled = false;
    void fetchCageTemplate(CAGE_FORM_KEY)
      .then((t) => { if (!cancelled) setTemplate(t); })
      .catch(() => { if (!cancelled) setTemplate(null); });
    return () => { cancelled = true; };
  }, [animalCageId]);

  const labels = view?.fieldLabels ?? {};

  /** canonical → 该字段的全部变更（时间正序），供字段点开查看。 */
  const fieldHistory = useMemo(() => {
    const m: Record<string, Array<{ at?: string | null; operator?: string | null; before?: string | null; after?: string | null }>> = {};
    for (const e of view?.events ?? []) {
      for (const c of e.changes) {
        if (!c.canonical) continue;
        (m[c.canonical] ??= []).push({ at: e.at, operator: e.operator, before: c.before, after: c.after });
      }
    }
    return m;
  }, [view]);

  /** 表单模式的分组：模板分区优先，模板外的历史字段兜到「其他」。只留有值或有变更的字段。 */
  const groups = useMemo(() => {
    const out: Array<{ title: string; fields: FieldRef[] }> = [];
    const seen = new Set<string>();
    const worth = (canonical: string) => fieldHistory[canonical] || show(view?.current[canonical]) !== null;
    for (const { section, field } of template ? flattenFields(template) : []) {
      if (seen.has(field.canonical)) continue;
      seen.add(field.canonical);
      if (!worth(field.canonical)) continue;
      let g = out.find((x) => x.title === section);
      if (!g) { g = { title: section, fields: [] }; out.push(g); }
      g.fields.push({ canonical: field.canonical, label: field.label || field.canonical });
    }
    const rest: FieldRef[] = [];
    for (const [code, label] of Object.entries(labels)) {
      if (seen.has(code) || !worth(code)) continue;
      rest.push({ canonical: code, label: label || code });
    }
    if (rest.length) out.push({ title: "其他", fields: rest });
    return out;
  }, [template, labels, fieldHistory, view]);

  const events = view?.events ?? [];
  const structuralCount = events.filter((e) => e.kind !== "EDIT").length;
  const changedFieldCount = new Set(
    events.flatMap((e) => e.changes.filter((c) => !isNoop(c)).map((c) => c.canonical)),
  ).size;

  return (
    <Dialog open={!!animalCageId} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* 弹层底色/文字必须显式走主题令牌 —— 基础样式的 bg-white/text-slate-900 在暗色下会与令牌文字撞成白底白字 */}
      <DialogContent className="z-[var(--z-modal)] flex max-h-[85vh] w-[94vw] max-w-[94vw] flex-col gap-0 overflow-hidden rounded-2xl border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-0 text-[var(--app-color-text-primary)] sm:w-full sm:max-w-3xl sm:rounded-xl">
        <DialogHeader className="shrink-0 border-b border-[var(--app-color-border-default)] px-4 py-3 pr-10 sm:px-6 sm:pr-12">
          <DialogTitle className="text-[15px]">笼位变更历史</DialogTitle>
          <DialogDescription className="mt-1 space-y-1.5">
            {/* 位置映射打头，笼位ID退居其次——ID 对人没有定位意义 */}
            <span className="block text-[13px] font-medium text-[var(--app-color-text-primary)]">
              {view?.cageLabel || "位置未索引"}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              {events.length > 0 && (
                <>
                  <span>{events.length} 次变更 · {changedFieldCount} 个字段受影响</span>
                  {structuralCount > 0 && (
                    <span
                      className="rounded px-1.5 py-0.5"
                      style={{
                        background: "color-mix(in srgb, var(--app-color-feedback-info) 12%, transparent)",
                        color: "var(--app-color-feedback-info)",
                      }}
                    >
                      含 {structuralCount} 次笼位迁移
                    </span>
                  )}
                </>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          {loading && <div className="py-10 text-center text-[12px] text-[var(--app-color-text-tertiary)]">加载中…</div>}
          {!loading && error && <div className="py-6 text-center text-[12px] text-[var(--app-color-feedback-danger)]">{error}</div>}
          {!loading && !error && events.length === 0 && (
            <div className="py-10 text-center text-[12px] text-[var(--app-color-text-tertiary)]">
              该笼位暂无变更留痕
            </div>
          )}

          {/* ── 表单模式：无笼位迁移，按详情弹窗的表单形式渲染，字段可点开看台账 ── */}
          {!loading && !error && events.length > 0 && structuralCount === 0 && (
            <div className="overflow-hidden rounded-[10px] border border-[var(--app-color-border-default)]">
              {groups.map((g) => (
                <div key={g.title}>
                  <SectionBar>{g.title}</SectionBar>
                  {g.fields.map(({ canonical, label }) => {
                    const hist = fieldHistory[canonical];
                    const value = show(view?.current[canonical]);
                    const open = openField === canonical;
                    return (
                      <div key={canonical} className="border-b border-[var(--app-color-border-default)] last:border-b-0">
                        {hist ? (
                          <button
                            type="button"
                            onClick={() => setOpenField(open ? null : canonical)}
                            className="grid w-full grid-cols-[minmax(88px,150px)_1fr_auto] items-baseline gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--app-color-surface-hover)]"
                          >
                            <span className="truncate text-[12px] text-[var(--app-color-text-tertiary)]" title={label}>
                              {label}
                            </span>
                            <span
                              className={`break-all text-[12px] ${
                                value === null
                                  ? "text-[var(--app-color-text-tertiary)]"
                                  : "font-semibold text-[var(--app-color-text-primary)]"
                              }`}
                            >
                              {value ?? "（空）"}
                            </span>
                            <span className="shrink-0 rounded bg-[var(--app-color-surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-secondary)]">
                              {hist.length} 次 {open ? "▴" : "▾"}
                            </span>
                          </button>
                        ) : (
                          <div className="grid grid-cols-[minmax(88px,150px)_1fr_auto] items-baseline gap-2 px-3 py-2">
                            <span className="truncate text-[12px] text-[var(--app-color-text-tertiary)]" title={label}>
                              {label}
                            </span>
                            <span className="break-all text-[12px] font-semibold text-[var(--app-color-text-primary)]">
                              {value ?? "（空）"}
                            </span>
                            <span />
                          </div>
                        )}
                        {open && hist && <FieldLedger rows={hist} />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ── 时间轴模式：出现了笼位迁移，逐次画「变更前表单 → 变更后表单」 ── */}
          {!loading && !error && structuralCount > 0 && (
            <div>
              {events.map((e, i) => (
                <TimelineNode
                  key={i}
                  event={e}
                  labels={labels}
                  first={i === 0}
                  last={i === events.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
