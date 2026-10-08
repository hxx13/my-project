import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

/**
 * AI 操作审计表 —— 一次工具调用一行，**包括被拒绝的**。
 *
 * 这是前期调试的主要反馈面：没有它，只能靠读库，看不到「模型到底提了什么、为什么被拒」。
 * 存储是完整的（原文不脱敏），**打码只发生在展示层**（见设计文档 §12.2）。
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

function fmt(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const isTrue = (v: unknown) => v === true || v === 1 || v === "1";

export default function AdminAiAuditPage() {
  const [toolName, setToolName] = useState("");
  const [deniedOnly, setDeniedOnly] = useState(false);
  const [executedOnly, setExecutedOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const query = useMemo(
    () => ({
      toolName: toolName || undefined,
      deniedOnly: deniedOnly || undefined,
      executed: executedOnly ? true : undefined,
      page: 0,
      size: 100,
    }),
    [toolName, deniedOnly, executedOnly],
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header>
        <h1 className="text-base font-semibold text-[var(--app-color-text-primary)]">AI 操作审计</h1>
        <p className="text-xs text-[var(--app-color-text-tertiary)]">
          共 {data?.total ?? 0} 条 · 被拒绝的调用也在表内（连续被拒 = 有人在试探）
        </p>
      </header>

      <AdminToolbar>
        <AdminToolbarPrimary>
          <AdminSelect
            aria-label="按工具筛选"
            value={toolName}
            onChange={(e) => setToolName(e.target.value)}
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
          <AdminToggle checked={deniedOnly} onChange={setDeniedOnly} label="只看被拒" />
          <AdminToggle checked={executedOnly} onChange={setExecutedOnly} label="只看已执行" />
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
        <section className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3">
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
        className="min-h-0 flex-1"
      >
        <table className="w-full min-w-max border-collapse text-left text-sm twin-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作人</th>
              <th>用户说的</th>
              <th>触发的动作</th>
              <th>参数</th>
              <th>结果</th>
              <th className="text-center">被拒</th>
              <th>确认人</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: AiAuditRow) => {
              const denied = !isTrue(r.capabilityGranted);
              const open = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setExpanded(open ? null : r.id)}
                    className="cursor-pointer"
                    title="点击展开完整原文"
                  >
                    <td className="whitespace-nowrap text-xs">{fmt(r.createdAt)}</td>
                    <td className="whitespace-nowrap text-xs" title={r.userId}>
                      {r.actorName || r.userId || "—"}
                      {r.actorRoleSnapshot ? (
                        <span className="ml-1 text-[10px] text-[var(--app-color-text-tertiary)]">
                          {r.actorRoleSnapshot}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] truncate text-xs" title={r.userUtterance}>
                      {maskSensitive(r.userUtterance) || "—"}
                    </td>
                    <td className="whitespace-nowrap text-xs font-medium">{r.toolName}</td>
                    <td
                      className="max-w-[220px] truncate font-mono text-[11px]"
                      title={maskSensitive(r.rawArguments)}
                    >
                      {maskSensitive(r.rawArguments) || "—"}
                    </td>
                    <td className="max-w-[200px] truncate text-xs" title={maskSensitive(r.rawResult)}>
                      {r.errorMessage
                        ? maskSensitive(r.errorMessage)
                        : maskSensitive(r.rawResult) || "—"}
                    </td>
                    <td className="text-center text-xs">
                      {denied ? (
                        <span className="text-[var(--app-color-feedback-error)]">是</span>
                      ) : (
                        <span className="text-[var(--app-color-text-tertiary)]">否</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-xs">{r.confirmedBy || "—"}</td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={8} className="whitespace-normal bg-[var(--app-color-surface-elevated)] p-3">
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
                            {r.denialReason ? ` · 拒绝原因：${r.denialReason}` : ""}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </AdminTableShell>
    </div>
  );
}
