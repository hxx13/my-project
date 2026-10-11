import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  fetchAiAuditRows,
  fetchAiAuditToolNames,
  fetchAiPromptPreview,
  type AiAuditRow,
} from "@/api/domains/aiGateway.api";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import {
  AdminToolbar,
  AdminToolbarActions,
  AdminToolbarPrimary,
} from "@/components/admin/AdminToolbar";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { cn } from "@/lib/utils";

/**
 * AI 操作审计表 —— 一次工具调用一行，**包括被拒绝的**。
 *
 * 这是前期调试的主要反馈面：没有它，只能靠读库，看不到「模型到底提了什么、为什么被拒」。
 * 存储是完整的（原文不脱敏），**打码只发生在展示层**（见设计文档 §12.2）。
 *
 * <p>表现分层：一轮里模型常连发好几个调用，它们的会话/时间/操作人/用量完全一样 ——
 * 逐行重复会把表刷成一堵墙。所以这些字段按轮合并成一块（rowSpan），
 * 而「模型提了什么、为什么被拒」这些**逐条**的信息才占一整行。
 * 原始 JSON 不在表里铺开（截断成 k=v 摘要），完整原文点开这一行走展开区看。
 */

/**
 * 展示层脱敏：手机号 / 身份证这类长数字串打码，其余原文保留。
 *
 * 用「前一位非数字」捕获组而不是后行断言 —— 后者在 XWEB86 一级的老内核上不受支持，
 * 出现在模块顶层会直接让整个包解析失败。
 */
function maskSensitive(text?: string): string {
  if (!text) return "";
  return text
    .replace(/(^|[^\d])(\d{3})\d{4}(\d{4})(?!\d)/g, "$1$2****$3")
    .replace(/(^|[^\d])(\d{6})\d{8}(\d{3}[\dXx])(?!\d)/g, "$1$2********$3");
}

function dateTimeParts(iso?: string): { d: string; t: string } {
  if (!iso) return { d: "—", t: "" };
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return { d: iso, t: "" };
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    d: `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`,
    t: `${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`,
  };
}

const isTrue = (v: unknown) => v === true || v === 1 || v === "1";

/** token 数压缩成 `48.9k` —— 表里排得下，精确值留在 tooltip。 */
function compactNum(n?: number | null): string {
  const v = n ?? 0;
  if (v < 1000) return String(v);
  return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
}

function cacheRate(r: AiAuditRow): { hit: number; total: number; pct: number } | null {
  const hit = r.promptCacheHitTokens ?? 0;
  const miss = r.promptCacheMissTokens ?? 0;
  if (hit + miss <= 0) return null;
  return { hit, total: hit + miss, pct: Math.round((hit / (hit + miss)) * 100) };
}

/**
 * 模型传的参数：能解析成对象就摊成 `k=v · k=v`，比截断的 JSON 好扫。
 *
 * <p>**先解析再打码**：打码会把数字串换成星号，先打码就不再是合法 JSON 了。
 */
function argPairs(raw?: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (t.startsWith("{")) {
    try {
      const o: unknown = JSON.parse(t);
      if (o && typeof o === "object" && !Array.isArray(o)) {
        const parts = Object.entries(o as Record<string, unknown>).map(
          ([k, v]) => `${k}=${v !== null && typeof v === "object" ? JSON.stringify(v) : String(v)}`,
        );
        return parts.length ? maskSensitive(parts.join(" · ")) : "";
      }
    } catch {
      /* 不是 JSON 就原样显示 */
    }
  }
  return maskSensitive(t);
}

/**
 * 返回值的摘要。原始 JSON 里嵌着整块列表，直接铺出来一屏全是 `{"total":87,"rooms":[{"campus":…`，
 * 认不出这是什么。这里只留「有哪些键、标量值是多少、列表有多长」—— 形状一眼可辨，
 * 具体内容展开看。
 */
function resultBrief(raw?: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  if (t.startsWith("{")) {
    try {
      const o: unknown = JSON.parse(t);
      if (o && typeof o === "object" && !Array.isArray(o)) {
        const parts = Object.entries(o as Record<string, unknown>).map(([k, v]) => {
          if (Array.isArray(v)) return `${k}[${v.length}]`;
          if (v !== null && typeof v === "object") return `${k}{…}`;
          const s = String(v);
          return `${k}=${s.length > 24 ? `${s.slice(0, 24)}…` : s}`;
        });
        return parts.length ? maskSensitive(parts.join(" · ")) : "";
      }
    } catch {
      /* 不是 JSON 就原样显示 */
    }
  }
  return maskSensitive(t);
}

const PILL =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium";
const PILL_DENIED =
  "border-[color-mix(in_srgb,var(--app-color-feedback-danger)_30%,transparent)] bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]";
const PILL_FAIL =
  "border-[color-mix(in_srgb,var(--app-color-feedback-warning)_30%,transparent)] bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]";
const PILL_OK =
  "border-[color-mix(in_srgb,var(--app-color-feedback-success)_30%,transparent)] bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]";
const PILL_MUTE =
  "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)]";

/**
 * 一条调用的结局。判据顺序即语义顺序（见 AiToolCallLog 字段注释）：
 * 能力没过 → 压根没执行；过了但 executed=false → 被确认流程拦下；执行了但 ok=false → 工具自己说不。
 */
function statusOf(r: AiAuditRow): { label: string; cls: string; reason?: string } {
  const reason = (r.denialReason || r.errorMessage || "").trim() || undefined;
  if (!isTrue(r.capabilityGranted)) return { label: "被拒", cls: PILL_DENIED, reason };
  if (!isTrue(r.executed)) return { label: "未执行", cls: PILL_MUTE, reason };
  if (r.ok != null && !isTrue(r.ok)) return { label: "未通过", cls: PILL_FAIL, reason };
  return { label: "已执行", cls: PILL_OK };
}

type TurnBlock = { key: string; rows: AiAuditRow[] };

/**
 * 按轮切块。行序是 `id DESC`（即写入序），一轮的调用必然连续，所以只看相邻即可。
 *
 * <p>分页边界可能把一轮切在两页上（每页独立成块，各块信息仍完整）；
 * 时间戳精确到秒，一轮跨秒也会切成两块 —— 都只影响观感。
 */
function groupTurns(rows: AiAuditRow[]): TurnBlock[] {
  const out: TurnBlock[] = [];
  for (const r of rows) {
    const key = `${r.sessionId}|${r.createdAt}|${r.userId ?? ""}|${r.userUtterance ?? ""}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else out.push({ key, rows: [r] });
  }
  return out;
}

/** 主表列数（时间 / 操作人 / 用户说的 / 动作 / 参数 / 结果 / 用量）—— 展开区 colspan 用 */
const COLS = 7;

const TH = "px-3 py-2 whitespace-nowrap";
const TD = "px-3 py-2 align-top";

export default function AdminAiAuditPage() {
  const [toolName, setToolName] = useState("");
  const [deniedOnly, setDeniedOnly] = useState(false);
  const [executedOnly, setExecutedOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);

  /**
   * 换筛选条件一律回到第一页 —— 否则在第 5 页改条件，命中变少后会停在一张空的第 5 页上，
   * 看着像「什么都没有」。
   */
  const resetTo = (fn: () => void) => {
    fn();
    setPage(0);
    setExpanded(null);
  };

  const query = useMemo(
    () => ({
      toolName: toolName || undefined,
      deniedOnly: deniedOnly || undefined,
      executed: executedOnly ? true : undefined,
      page,
      size,
    }),
    [toolName, deniedOnly, executedOnly, page, size],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aiAuditRows", query] as const,
    queryFn: () => fetchAiAuditRows(query),
  });

  const { data: toolNames } = useQuery({
    queryKey: ["aiAuditToolNames"] as const,
    queryFn: fetchAiAuditToolNames,
  });

  const { data: preview } = useQuery({
    queryKey: ["aiPromptPreview"] as const,
    queryFn: () => fetchAiPromptPreview(),
    enabled: showPrompt,
  });

  const rows = data?.rows ?? [];
  const blocks = useMemo(() => groupTurns(rows), [rows]);

  return (
    /**
     * 高度链：后台外壳只保证 `min-h-screen`（随内容长高，没有确定高度），
     * 所以想要「表体自己滚、整页不滚」必须在这一层把高度封到视口 ——
     * `h-full` 挂在这种父级上等于 auto，页面会被 100 行记录撑到五千多像素。
     * 用 max-h（不是 h）是为了短列表时卡片贴合内容，不硬撑一整屏。
     */
    <div className="flex max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-3">
      <header className="shrink-0">
        <h1 className="text-base font-semibold text-[var(--app-color-text-primary)]">AI 操作审计</h1>
        <p className="text-xs text-[var(--app-color-text-tertiary)]">
          被拒绝的调用也在表内（连续被拒 = 有人在试探）· 点任意一行看完整原文
        </p>
      </header>

      <AdminToolbar>
        <AdminToolbarPrimary>
          <AdminSelect
            aria-label="按工具筛选"
            value={toolName}
            onChange={(e) => resetTo(() => setToolName(e.target.value))}
          >
            <option value="">全部工具</option>
            {(toolNames ?? []).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </AdminSelect>
        </AdminToolbarPrimary>
        <AdminToolbarActions>
          <AdminToggle
            checked={deniedOnly}
            onChange={(v) => resetTo(() => setDeniedOnly(v))}
            label="只看被拒"
          />
          <AdminToggle
            checked={executedOnly}
            onChange={(v) => resetTo(() => setExecutedOnly(v))}
            label="只看已执行"
          />
          <AdminButton
            tone="secondary"
            onClick={() => setShowPrompt((v) => !v)}
          >
            {showPrompt ? "收起约束预览" : "约束预览"}
          </AdminButton>
          <AdminButton tone="primary" loading={isLoading} onClick={() => refetch()}>
            刷新
          </AdminButton>
        </AdminToolbarActions>
      </AdminToolbar>

      {showPrompt ? (
        /* 必须封顶：28 层折叠项加起来一千多像素，不封顶会把表格压成 0 高度、整页还被撑到视口之外 */
        <section className="max-h-[45vh] shrink-0 overflow-y-auto overscroll-y-contain rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3 [scrollbar-gutter:stable]">
          <p className="mb-2 text-xs text-[var(--app-color-text-tertiary)]">
            发给模型的前置约束。L0/L1 存在系统配置里、L2（工具描述）在代码里，单看任何一处都看不全 —— 这里是拼装后的结果。
          </p>
          <div className="flex flex-col gap-2">
            {(preview?.layers ?? []).map((l, i) => (
              <details
                key={i}
                className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] p-2"
              >
                <summary className="cursor-pointer text-xs text-[var(--app-color-text-secondary)]">
                  {l.title}
                  <span className="ml-2 rounded bg-[var(--app-color-surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-tertiary)]">
                    {l.source}
                  </span>
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-[var(--app-color-text-secondary)]">
                  {l.content}
                </pre>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <AdminTableShell
        loading={isLoading}
        error={error ? "审计数据加载失败" : null}
        onRetry={() => refetch()}
        empty={!isLoading && rows.length === 0}
        emptyMessage="还没有 AI 操作记录"
        scrollable
        fill
      >
        {/* table-fixed + 列宽写死：本表的参数/结果是机器原文，max-content 会把列撑到一行放不下为止
            （用户说的一句话能顶出 300px），表格就横着溢出、「用量」被挤出视口。
            列宽固定后由 line-clamp / break-words 决定怎么折行。 */}
        <table className="twin-table twin-table--merged-rows w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr>
              <th className={cn(TH, "w-[6.5rem]")}>时间</th>
              <th className={cn(TH, "w-[7.5rem]")}>操作人</th>
              <th className={cn(TH, "w-[15rem]")}>用户说的</th>
              <th className={cn(TH, "w-[14rem]")}>触发的动作</th>
              <th className={cn(TH, "w-[15rem]")}>参数</th>
              <th className={cn(TH, "w-[12rem]")}>结果</th>
              <th className={cn(TH, "w-[6.5rem]")}>用量</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((block) => {
              const first = block.rows[0];
              const n = block.rows.length;
              // 块内有展开行时不能合并 —— 详情行占满整行，会把 rowSpan 格撑破（同违规记录表）
              const merge = n > 1 && (expanded == null || !block.rows.some((r) => r.id === expanded));
              return (
                <Fragment key={block.key}>
                  {block.rows.map((r, i) => {
                    const open = expanded === r.id;
                    const st = statusOf(r);
                    // 合并格的取值：合并时取块首行（块内本就同值），不合并时逐行取自己
                    const mv = merge ? first : r;
                    const dt = dateTimeParts(mv.createdAt);
                    const cache = cacheRate(mv);
                    return (
                      <Fragment key={r.id}>
                        <tr
                          onClick={() => setExpanded(open ? null : r.id)}
                          className={cn(
                            "cursor-pointer",
                            i === 0 && "border-t border-t-[var(--twin-hairline)]",
                          )}
                          title={open ? "收起原文" : "点击展开完整原文"}
                        >
                          {i === 0 || !merge ? (
                            <td rowSpan={merge ? n : undefined} className={cn(TD, "whitespace-nowrap")}>
                              <div className="text-[11px] leading-tight text-[var(--app-color-text-tertiary)]">
                                {dt.d}
                              </div>
                              <div className="text-xs leading-tight tabular-nums text-[var(--app-color-text-secondary)]">
                                {dt.t}
                              </div>
                            </td>
                          ) : null}

                          {i === 0 || !merge ? (
                            <td rowSpan={merge ? n : undefined} className={cn(TD, "whitespace-nowrap")}>
                              <div className="truncate text-xs text-[var(--app-color-text-primary)]">
                                {mv.actorName || mv.userId || "—"}
                              </div>
                              {mv.actorRoleSnapshot ? (
                                <div className="truncate text-[10px] text-[var(--app-color-text-tertiary)]">
                                  {mv.actorRoleSnapshot}
                                </div>
                              ) : null}
                            </td>
                          ) : null}

                          {i === 0 || !merge ? (
                            <td rowSpan={merge ? n : undefined} className={cn(TD, "align-top")}>
                              <p
                                className="line-clamp-3 text-xs leading-snug text-[var(--app-color-text-secondary)]"
                                title={maskSensitive(mv.userUtterance)}
                              >
                                {maskSensitive(mv.userUtterance) || "—"}
                              </p>
                            </td>
                          ) : null}

                          {/* 逐条字段：一行一条调用 */}
                          <td className={cn(TD, "w-[14rem]")}>
                            <div className="flex items-center gap-1">
                              <ChevronRight
                                aria-hidden
                                className={cn(
                                  "size-3 shrink-0 text-[var(--app-color-text-tertiary)] transition-transform",
                                  open && "rotate-90",
                                )}
                              />
                              <span
                                className="min-w-0 truncate text-xs font-medium text-[var(--app-color-text-primary)]"
                                title={r.toolName}
                              >
                                {r.toolName}
                              </span>
                              <span className={cn(PILL, st.cls)}>{st.label}</span>
                            </div>
                            {st.reason ? (
                              <p
                                className="mt-0.5 line-clamp-2 break-words pl-[1.125rem] text-[11px] leading-snug text-[var(--app-color-text-tertiary)]"
                                title={maskSensitive(st.reason)}
                              >
                                {maskSensitive(st.reason)}
                              </p>
                            ) : null}
                            {r.confirmedBy ? (
                              <p className="mt-0.5 pl-[1.125rem] text-[11px] text-[var(--app-color-text-tertiary)]">
                                {r.confirmedBy} 确认
                              </p>
                            ) : null}
                          </td>

                          <td className={cn(TD, "w-[15rem]")}>
                            <p
                              className="line-clamp-2 break-words font-mono text-[11px] leading-snug text-[var(--app-color-text-secondary)]"
                              title={argPairs(r.rawArguments)}
                            >
                              {argPairs(r.rawArguments) || "—"}
                            </p>
                          </td>

                          <td className={cn(TD, "w-[12rem]")}>
                            {r.errorMessage ? (
                              <p
                                className="line-clamp-2 break-words text-[11px] leading-snug text-[var(--app-color-feedback-danger)]"
                                title={maskSensitive(r.errorMessage)}
                              >
                                {maskSensitive(r.errorMessage)}
                              </p>
                            ) : (
                              <p
                                className="line-clamp-2 break-words font-mono text-[11px] leading-snug text-[var(--app-color-text-tertiary)]"
                                title={resultBrief(r.rawResult)}
                              >
                                {resultBrief(r.rawResult) || "—"}
                              </p>
                            )}
                          </td>

                          {i === 0 || !merge ? (
                            <td rowSpan={merge ? n : undefined} className={cn(TD, "whitespace-nowrap")}>
                              {mv.promptTokens == null && mv.completionTokens == null ? (
                                <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>
                              ) : (
                                <div
                                  className="text-[11px] leading-tight tabular-nums text-[var(--app-color-text-secondary)]"
                                  title={`输入 ${(mv.promptTokens ?? 0).toLocaleString()} / 输出 ${(mv.completionTokens ?? 0).toLocaleString()}`}
                                >
                                  <div>
                                    <span className="text-[var(--app-color-text-tertiary)]">↑</span>{" "}
                                    {compactNum(mv.promptTokens)}
                                    <span className="ml-1 text-[var(--app-color-text-tertiary)]">↓</span>{" "}
                                    {compactNum(mv.completionTokens)}
                                  </div>
                                  {mv.reasoningTokens ? (
                                    <div className="text-[var(--app-color-text-tertiary)]">
                                      思考 {compactNum(mv.reasoningTokens)}
                                    </div>
                                  ) : null}
                                  {/* 缓存命中率只在审计里露（对话界面不放）：它是成本核对的数，不是给用户看的 */}
                                  {cache ? (
                                    <div
                                      className="text-[var(--app-color-text-tertiary)]"
                                      title={`输入里命中缓存的 token 占比：${cache.hit.toLocaleString()}/${cache.total.toLocaleString()}。越高越省钱 —— 这套「共享在前、个性化在后」的顺序就是为它服务的`}
                                    >
                                      缓存 {cache.pct}%
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          ) : null}
                        </tr>

                        {open ? (
                          <tr data-detail-row>
                            <td colSpan={COLS} className="whitespace-normal bg-[var(--app-color-surface-elevated)] p-3">
                              <div className="grid gap-2 text-xs text-[var(--app-color-text-secondary)] md:grid-cols-2">
                                <div>
                                  <div className="mb-1 font-medium">模型传的原始参数</div>
                                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--app-color-surface-container)] p-2">
                                    {maskSensitive(r.rawArguments) || "（无）"}
                                  </pre>
                                </div>
                                <div>
                                  <div className="mb-1 font-medium">执行返回</div>
                                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--app-color-surface-container)] p-2">
                                    {maskSensitive(r.rawResult) || "（未执行）"}
                                  </pre>
                                </div>
                                <div className="md:col-span-2">
                                  会话 #{r.sessionId} · {r.sessionTitle || "无标题"} · 所需能力{" "}
                                  {r.requiredCapability || "—"}
                                  {r.confirmedBy ? ` · 确认人 ${r.confirmedBy}` : ""}
                                  {r.denialReason ? ` · 拒绝原因：${r.denialReason}` : ""}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </AdminTableShell>

      {(data?.total ?? 0) > 0 ? (
        <AdminPagination
          className="shrink-0"
          total={data?.total ?? 0}
          page={page + 1}
          size={size}
          onPageChange={(p) => {
            setPage(p - 1);
            setExpanded(null);
          }}
          onSizeChange={(s) => {
            setSize(s);
            setPage(0);
          }}
        />
      ) : null}
    </div>
  );
}
