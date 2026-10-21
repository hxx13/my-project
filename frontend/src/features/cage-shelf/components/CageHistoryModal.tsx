import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
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
import { CAGE_BOX_ACTIONS, isVideoMediaUrl } from "../constants";

type FieldRef = { canonical: string; label: string };
type ChangeRow = { canonical?: string | null; label?: string | null; before?: string | null; after?: string | null };

function fmt(s?: string | null): string {
  return s ? s.replace("T", " ").substring(0, 16) : "—";
}

/** 时间轴左栏用：日期一行、时分一行，倒序阅读时第一眼就是「什么时候」。 */
function splitAt(s?: string | null): { date: string; time: string } {
  if (!s) return { date: "—", time: "" };
  const t = s.replace("T", " ").trim();
  const [date, rest] = t.split(/\s+/);
  const time = (rest ?? "").substring(0, 5);
  return { date: date || "—", time: time || t.substring(0, 16) };
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

/* ── 值展示：历史里存的是表单原始值，「本地扩展数据」是一段 JSON + 一串上传地址。
      直接打印既看不懂，也会把「换了个主机名」当成一次变更；所以按字段拆开、附件出缩略图。 ── */

/** 历史里可能存着别的主机写进数据的绝对地址（http://localhost:8081/api/upload/…），
 *  统一收敛到当前站点同路径 —— 否则预览图会打到用户本机的 8081。文件本身是软删除的，
 *  从笼位移除后仍留在磁盘上，历史里的旧地址必须还能打开。 */
function mediaUrl(raw: string): string {
  const u = raw.trim();
  const i = u.indexOf("/api/upload/");
  return i >= 0 ? u.slice(i) : u;
}

const MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|m4v)(?:[?#]|$)/i;
const isMediaUrl = (v: unknown): v is string => typeof v === "string" && MEDIA_EXT_RE.test(v);

/** 只有 `{…}` / `[…]` 且解析得出来才当结构化数据；普通文本原样显示。 */
function tryParseJson(raw?: string | null): unknown {
  const s = (raw ?? "").trim();
  if (!s || (s[0] !== "{" && s[0] !== "[") || !/[}\]]$/.test(s)) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** 扩展数据里的 key → 人话（状态照片点位的 key 就是状态字段 canonical）。 */
const EXTRA_KEY_LABELS: Record<string, string> = {
  _note: "标注备注",
  _status: "状态照片",
  ...Object.fromEntries(CAGE_BOX_ACTIONS.map((a) => [a.statusField, a.label])),
};
const keyLabel = (k: string) => EXTRA_KEY_LABELS[k] ?? k;

/** 归一化：上传地址的主机前缀、JSON 键顺序、照片顺序都不算「真变更」。 */
function canonicalLeaf(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonicalLeaf).sort().join(",") + "]";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonicalLeaf(o[k])).join(",") + "}";
  }
  if (typeof v === "string") return JSON.stringify(mediaUrl(v));
  return JSON.stringify(v ?? null);
}

function normalizedValue(v?: string | null): string {
  const raw = (v ?? "").trim();
  if (!raw) return "";
  const parsed = tryParseJson(raw);
  return parsed ? canonicalLeaf(parsed) : mediaUrl(raw);
}

const isNoop = (c: ChangeRow) => normalizedValue(c.before) === normalizedValue(c.after);

/** 附件缩略图：图片出图、视频出首帧 + 播放角标，点开在弹层里看大图/播放。 */
function MediaThumbs({ urls, small = false }: { urls: string[]; small?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const size = small ? "h-8 w-8" : "h-10 w-10";
  return (
    <>
      {urls.map((u, i) => {
        const src = mediaUrl(u);
        const video = isVideoMediaUrl(src);
        const dead = broken.has(src);
        return (
          <button
            key={`${u}:${i}`}
            type="button"
            onClick={() => { if (!dead) setPreview(src); }}
            className="relative block shrink-0 cursor-pointer transition hover:opacity-80 disabled:cursor-default"
            disabled={dead}
            title={dead ? "附件已不可用" : video ? "点击播放视频" : "点击查看大图"}
          >
            {dead ? (
              <span className={`${size} grid place-items-center rounded-md border border-dashed border-[var(--app-color-border-default)] text-[9px] text-[var(--app-color-text-tertiary)]`}>
                失效
              </span>
            ) : video ? (
              <>
                <video
                  src={src}
                  muted
                  preload="metadata"
                  onError={() => setBroken((s) => new Set(s).add(src))}
                  className={`${size} rounded-md border border-[var(--app-color-border-default)] object-cover`}
                />
                <span className="absolute inset-0 grid place-items-center rounded-md bg-black/35 text-white">
                  <Play className="size-3.5" fill="currentColor" />
                </span>
              </>
            ) : (
              <img
                src={src}
                alt=""
                onError={() => setBroken((s) => new Set(s).add(src))}
                className={`${size} rounded-md border border-[var(--app-color-border-default)] object-cover`}
              />
            )}
          </button>
        );
      })}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="z-[calc(var(--z-modal)+5)] max-w-[min(1100px,94vw)] overflow-hidden border-0 bg-black p-0 [&>button]:text-white">
          <DialogTitle className="sr-only">附件预览</DialogTitle>
          <DialogDescription className="sr-only">点击右上角关闭</DialogDescription>
          {preview && (isVideoMediaUrl(preview) ? (
            <video src={preview} controls autoPlay playsInline className="max-h-[86vh] w-full bg-black object-contain" />
          ) : (
            <img src={preview} alt="预览" className="max-h-[86vh] w-full object-contain" />
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 一个 JSON 叶子值：媒体出缩略图，数组拆开，其余转成文字。 */
function LeafView({ value, emptyLabel = "（空）" }: { value: unknown; emptyLabel?: string }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-[var(--app-color-text-tertiary)]">{emptyLabel}</span>;
  }
  if (isMediaUrl(value)) return <MediaThumbs urls={[value]} small />;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[var(--app-color-text-tertiary)]">（无）</span>;
    const media = value.filter(isMediaUrl);
    const rest = value.filter((v) => !isMediaUrl(v));
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {media.length > 0 && <MediaThumbs urls={media} small />}
        {rest.length > 0 && (
          <span className="break-all">{rest.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join("、")}</span>
        )}
      </span>
    );
  }
  if (typeof value === "boolean") return <span>{value ? "是" : "否"}</span>;
  if (typeof value === "object") return <span className="break-all">{JSON.stringify(value)}</span>;
  return <span className="break-all">{String(value)}</span>;
}

/** 整段值：JSON 按 key 拆成「字段名 + 值」，附件直接出图。 */
function ValueView({ value, emptyLabel = "（空）" }: { value?: string | null; emptyLabel?: string }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-[var(--app-color-text-tertiary)]">{emptyLabel}</span>;
  }
  const parsed = tryParseJson(value);
  if (parsed && !Array.isArray(parsed)) {
    return (
      <span className="flex flex-col gap-0.5">
        {Object.entries(parsed as Record<string, unknown>).map(([k, v]) => (
          <span key={k} className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{keyLabel(k)}</span>
            <LeafView value={v} />
          </span>
        ))}
      </span>
    );
  }
  if (parsed) return <LeafView value={parsed} />;
  const text = show(value) ?? "";
  if (isMediaUrl(text)) return <MediaThumbs urls={[text]} small />;
  return <span className="whitespace-pre-wrap break-all">{text}</span>;
}

type KeyDiff = { key: string; before: unknown; after: unknown };

/** JSON 对象按 key 做差：只列真的变了的 key（整段 JSON 原样对比会把键序、主机前缀当变化）。 */
function jsonKeyDiff(before?: string | null, after?: string | null): KeyDiff[] | null {
  const b = tryParseJson(before);
  const a = tryParseJson(after);
  if (!b || !a || Array.isArray(b) || Array.isArray(a)) return null;
  const bk = b as Record<string, unknown>;
  const ak = a as Record<string, unknown>;
  const labelOrder = Object.keys(EXTRA_KEY_LABELS);
  const rank = (k: string) => {
    const i = labelOrder.indexOf(k);
    return i >= 0 ? i : 999;
  };
  return [...new Set([...Object.keys(bk), ...Object.keys(ak)])]
    .sort((x, y) => rank(x) - rank(y) || x.localeCompare(y))
    .filter((k) => canonicalLeaf(bk[k]) !== canonicalLeaf(ak[k]))
    .map((k) => ({ key: k, before: bk[k], after: ak[k] }));
}

/** 单条变更：旧值弱化 → 新值强调；清空显式写「（清空）」而不是留白。 */
function DiffLine({ label, before, after }: { label: string; before?: string | null; after?: string | null }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-2 text-[12px] leading-5">
      <span className="w-[64px] shrink-0 truncate text-[var(--app-color-text-tertiary)] sm:w-[76px]" title={label}>
        {label}
      </span>
      <span className="min-w-0 text-[var(--app-color-text-tertiary)]">
        <ValueView value={before} />
      </span>
      <span className="shrink-0 text-[var(--app-color-text-tertiary)]">→</span>
      <span className="min-w-0 font-medium text-[var(--app-color-text-primary)]">
        <ValueView value={after} emptyLabel="（清空）" />
      </span>
    </div>
  );
}

/**
 * 字段级 diff：JSON 值（「本地扩展数据」）按 key 拆开，只显示真正变了的键。
 * 这样历史里看到的是「健康异常：1 张 → 2 张」而不是两坨 JSON 文本。
 */
function FieldDiff({ label, before, after }: { label: string; before?: string | null; after?: string | null }) {
  const keys = jsonKeyDiff(before, after);
  if (!keys) return <DiffLine label={label} before={before} after={after} />;
  return (
    <div className="min-w-0">
      <div className="mb-0.5 text-[11px] text-[var(--app-color-text-tertiary)]">{label}</div>
      {keys.length === 0 ? (
        <div className="text-[12px] text-[var(--app-color-text-tertiary)]">无字段变化</div>
      ) : (
        <div className="space-y-1">
          {keys.map(({ key, before: b, after: a }) => (
            <div key={key} className="flex min-w-0 flex-wrap items-baseline gap-1.5 text-[12px] leading-5">
              <span className="w-[64px] shrink-0 truncate text-[var(--app-color-text-tertiary)] sm:w-[76px]" title={keyLabel(key)}>
                {keyLabel(key)}
              </span>
              <span className="min-w-0 text-[var(--app-color-text-tertiary)]">
                <LeafView value={b} />
              </span>
              <span className="shrink-0 text-[var(--app-color-text-tertiary)]">→</span>
              <span className="min-w-0 font-medium text-[var(--app-color-text-primary)]">
                <LeafView value={a} emptyLabel="（清空）" />
              </span>
            </div>
          ))}
        </div>
      )}
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
function FieldLedger({ label, rows }: { label: string; rows: Array<{ at?: string | null; operator?: string | null; before?: string | null; after?: string | null }> }) {
  return (
    <div className="space-y-1.5 border-l-2 border-[var(--app-color-border-default)] pl-3 ml-3 pb-2">
      {rows.map((h, i) => (
        <div key={i}>
          <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--app-color-text-tertiary)]">
            <span className="tabular-nums">{fmt(h.at)}</span>
            {h.operator && <span>{h.operator}</span>}
          </div>
          <FieldDiff label={label} before={h.before} after={h.after} />
        </div>
      )).reverse()}
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
        {changed.map((c, i) => (
          <div key={`${c.canonical}-${i}`} className="text-[12px] leading-5">
            <div className="text-[11px] text-[var(--app-color-text-tertiary)]">{labelOf(c)}</div>
            <div
              className={
                side === "after"
                  ? "font-semibold text-[var(--app-color-text-primary)]"
                  : "text-[var(--app-color-text-secondary)]"
              }
            >
              <ValueView value={side === "before" ? c.before : c.after} />
            </div>
          </div>
        ))}
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
  const when = splitAt(event.at);

  return (
    <div className="flex gap-2 sm:gap-3">
      {/* 时间放在最前：倒序时先看到「什么时候」，再读「改了什么」 */}
      <div className="w-[64px] shrink-0 pt-1.5 text-right sm:w-[84px]">
        <div className="text-[11px] leading-4 tabular-nums text-[var(--app-color-text-tertiary)]">{when.date}</div>
        <div className="text-[13px] font-semibold leading-5 tabular-nums text-[var(--app-color-text-primary)] sm:text-[15px]">
          {when.time}
        </div>
      </div>

      <div className="relative min-w-0 flex-1 pb-3 pl-5">
        {/* 轨道：首节点不画上半段，末节点只画到圆点为止；只有一个节点时整条不画 */}
        {!(first && last) && (
          <span
            className="absolute left-[4px] w-[2px] rounded-full bg-[var(--app-color-border-strong)] opacity-60"
            style={{
              top: first ? 12 : 0,
              bottom: last ? "auto" : 0,
              height: last ? 12 : undefined,
            }}
          />
        )}
        <span
          className="absolute left-0 top-[9px] h-[10px] w-[10px] rounded-full ring-2 ring-[var(--app-color-surface-container)]"
          style={{ background: meta.dot }}
        />
        <div className="review-card" data-tone={meta.tone}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2">
            <span className="text-[12px] font-semibold text-[var(--app-color-text-primary)]">{meta.label}</span>
            <span className="text-[11px] text-[var(--app-color-text-tertiary)]">
              {CHANGE_TYPE_LABEL[event.changeType] ?? event.changeType}
            </span>
            {event.operator && (
              <span className="ml-auto text-[11px] text-[var(--app-color-text-secondary)]">{event.operator}</span>
            )}
          </div>

          <div className="border-t border-[var(--app-color-border-default)] px-3 py-2">
            {changed.length === 0 ? (
              <div className="text-[12px] text-[var(--app-color-text-tertiary)]">无字段变化</div>
            ) : event.kind === "EDIT" ? (
              <div className="space-y-1">
                {changed.map((c, i) => (
                  <FieldDiff key={i} label={labelOf(c)} before={c.before} after={c.after} />
                ))}
              </div>
            ) : (
              <MigrationBody changes={event.changes} labels={labels} />
            )}
          </div>
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

  // 倒序：最新的变更排在最前。后端按时间正序聚合，事件里的 before/after 快照已经固化，反转不影响对比。
  const events = useMemo(() => [...(view?.events ?? [])].reverse(), [view]);
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
                  <span>{events.length} 次变更 · {changedFieldCount} 个字段受影响 · 最新在上</span>
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
                            <span className="break-all text-[12px] font-semibold text-[var(--app-color-text-primary)]">
                              <ValueView value={view?.current[canonical]} />
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
                              <ValueView value={view?.current[canonical]} />
                            </span>
                            <span />
                          </div>
                        )}
                        {open && hist && <FieldLedger label={label} rows={hist} />}
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
