import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelAiTimer,
  cancelAllAiTimers,
  confirmAiTimer,
  fetchAiTimers,
  skipAiTimer,
  type AiTimerRow,
} from "@/api/domains/aiTimer.api";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import {
  AdminToolbar,
  AdminToolbarActions,
  AdminToolbarPrimary,
} from "@/components/admin/AdminToolbar";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { AdminButton } from "@/components/admin/AdminButton";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appAlert, appConfirm } from "@/lib/appDialog";

/**
 * AI 计时器 —— 大模型定时执行的账本。
 *
 * 四件事一眼看清：**谁**（发起人 + 角色快照）、**何时开的**（created_at）、
 * **何时结束**（fired_at / cancelled_at）、**执行了什么**（工具名 + 参数 + 结果）。
 *
 * 倒计时**以服务端时间为锚**：这里存的是服务端给的 `fireAtMillis`（绝对时刻），
 * 本地每秒自减只为显示；每次轮询都拿服务端时间重新对表。所以
 * ① 本地时钟不准不影响；② 后端重启也不影响（库里存的就是绝对时刻，没有「剩 N 秒」这种派生量）。
 */

/** 轮询间隔：与后端调度器的 5 秒 tick 对齐 —— 到点后最多 5 秒这里就翻状态。 */
const POLL_MS = 5000;

const fmt = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** 毫秒 → 倒计时文本。超过一天就带上天，避免出现 26:31:07 这种读不出来的形态。 */
function countdown(ms: number): string {
  if (Number.isNaN(ms)) return "—";
  if (ms <= 0) return "已到点";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}天 ${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}:${p(s)}`;
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "text-[var(--app-color-text-primary)]",
  FIRING: "text-[var(--app-color-feedback-info)]",
  AWAITING_CONFIRM: "text-[var(--app-color-feedback-warning)]",
  FIRED: "text-[var(--app-color-feedback-success)]",
  CANCELLED: "text-[var(--app-color-text-tertiary)]",
  FAILED: "text-[var(--app-color-feedback-danger)]",
};

export default function AdminAiTimersPage() {
  const queryClient = useQueryClient();
  const role = authStorage.getRole() || "MEMBER";
  const canSeeAll = hasMinRole(role, "SUPER_ADMIN");

  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  /** 本地每秒跳一格，只为让倒计时有动感；真值仍由服务端对表决定。 */
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aiTimers", scope, status] as const,
    queryFn: () => fetchAiTimers({ scope, status: status || undefined }),
    refetchInterval: POLL_MS,
  });

  /** 服务端时间 - 本地时间。本次轮询内恒定，用来把「服务端此刻」换算到本地时间轴上。 */
  const clockOffset = data ? data.serverNowMillis - data.clientAt : 0;
  const serverNow = tick + clockOffset;

  const rows = data?.list ?? [];
  const openCount = data?.openCount ?? 0;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["aiTimers"] });

  const act = useMutation({
    mutationFn: async (action: { kind: "cancel" | "confirm" | "skip"; id: number }) => {
      if (action.kind === "cancel") return cancelAiTimer(action.id);
      if (action.kind === "confirm") return confirmAiTimer(action.id);
      return skipAiTimer(action.id);
    },
    onSuccess: (res) => {
      // HTTP 200 + success:false 也是失败 —— 不解这个字段就会把「被拒」显示成「成功」。
      if (res && res.success === false) {
        void appAlert(res.message || "操作没成功");
      }
      void invalidate();
    },
    onError: () => void appAlert("操作失败，请刷新后重试"),
  });

  const stopAll = async () => {
    const ok = await appConfirm(
      scope === "all"
        ? "停掉所有人正在倒计时的计时器？这个动作不可撤销。"
        : "停掉你自己正在倒计时的计时器？",
    );
    if (!ok) return;
    const res = await cancelAllAiTimers();
    if (res.success === false) {
      void appAlert(res.message || "操作没成功");
    } else {
      void appAlert(`已停止 ${res.data ?? 0} 个计时器`);
    }
    void invalidate();
  };

  const ownerLabel = (r: AiTimerRow) =>
    `${r.ownerName || r.ownerUserId || "—"}${r.ownerRole ? ` · ${r.ownerRole}` : ""}`;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-[var(--app-color-text-primary)]">AI 计时器</h1>
          <p className="text-xs text-[var(--app-color-text-tertiary)]">
            大模型定时的动作都记在这里 · 在跑 {openCount} 个
            {data ? ` · 服务端时间 ${data.serverNow}（倒计时以它为准）` : ""}
          </p>
        </div>
      </header>

      <AdminToolbar>
        <AdminToolbarPrimary>
          {canSeeAll ? (
            <AdminSelect
              aria-label="查看范围"
              value={scope}
              onChange={(e) => setScope(e.target.value === "all" ? "all" : "mine")}
            >
              <option value="mine">只看我的</option>
              <option value="all">全部人的（超管）</option>
            </AdminSelect>
          ) : null}
          <AdminSelect
            aria-label="按状态筛选"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="PENDING">倒计时中</option>
            <option value="AWAITING_CONFIRM">等待确认</option>
            <option value="FIRED">已完成</option>
            <option value="CANCELLED">已取消</option>
            <option value="FAILED">失败</option>
          </AdminSelect>
        </AdminToolbarPrimary>
        <AdminToolbarActions>
          <AdminButton tone="secondary" onClick={() => void stopAll()} disabled={openCount === 0}>
            全部停止
          </AdminButton>
          <AdminButton tone="primary" loading={isLoading} onClick={() => refetch()}>
            刷新
          </AdminButton>
        </AdminToolbarActions>
      </AdminToolbar>

      <AdminTableShell
        loading={isLoading}
        error={error ? "计时器加载失败" : null}
        onRetry={() => refetch()}
        empty={!isLoading && rows.length === 0}
        emptyMessage="还没有计时器。在智能精灵球里说「10 秒后帮我查一下 2 楼湿度」试试。"
        scrollable
        className="min-h-0 flex-1"
      >
        <table className="w-full min-w-max border-collapse text-left text-sm twin-table">
          <thead>
            <tr>
              <th>状态</th>
              <th>倒计时</th>
              <th>要做什么</th>
              <th>动作</th>
              <th>发起人</th>
              <th>开启时间</th>
              <th>结束时间</th>
              <th>结果</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pending = r.status === "PENDING";
              const awaiting = r.status === "AWAITING_CONFIRM";
              const remain = r.fireAtMillis != null ? r.fireAtMillis - serverNow : NaN;
              const open = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setExpanded(open ? null : r.id)}
                    className="cursor-pointer"
                    title="点击展开参数与结果原文"
                  >
                    <td className={`whitespace-nowrap text-xs font-medium ${STATUS_TONE[r.status] ?? ""}`}>
                      {r.statusZh || r.status}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">
                      {pending ? countdown(remain) : "—"}
                    </td>
                    <td className="max-w-[240px] truncate text-xs" title={r.label}>
                      {r.label || "—"}
                    </td>
                    <td className="whitespace-nowrap font-mono text-xs">{r.toolName}</td>
                    <td className="whitespace-nowrap text-xs">{ownerLabel(r)}</td>
                    <td className="whitespace-nowrap text-xs">{fmt(r.createdAt)}</td>
                    <td className="whitespace-nowrap text-xs">
                      {r.firedAt || r.cancelledAt ? fmt(r.firedAt || r.cancelledAt) : "—"}
                    </td>
                    <td className="max-w-[220px] truncate text-xs" title={r.error || r.result}>
                      {r.error ? (
                        <span className="text-[var(--app-color-feedback-error)]">{r.error}</span>
                      ) : (
                        r.result || "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {awaiting ? (
                        <span className="inline-flex gap-2">
                          <AdminButton
                            tone="primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              act.mutate({ kind: "confirm", id: r.id });
                            }}
                          >
                            确认执行
                          </AdminButton>
                          <AdminButton
                            tone="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              act.mutate({ kind: "skip", id: r.id });
                            }}
                          >
                            放弃
                          </AdminButton>
                        </span>
                      ) : pending ? (
                        <AdminButton
                          tone="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            act.mutate({ kind: "cancel", id: r.id });
                          }}
                        >
                          停止
                        </AdminButton>
                      ) : (
                        <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>
                      )}
                    </td>
                  </tr>
                  {open ? (
                    <tr>
                      <td colSpan={9} className="whitespace-normal bg-[var(--app-color-surface-elevated)] p-3">
                        <div className="grid gap-2 text-xs text-[var(--app-color-text-secondary)] md:grid-cols-2">
                          <div>
                            <div className="mb-1 font-medium">传给工具的原始参数</div>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--app-color-surface-container)] p-2">
                              {r.argsJson || "（无）"}
                            </pre>
                          </div>
                          <div>
                            <div className="mb-1 font-medium">执行返回</div>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-[var(--app-color-surface-container)] p-2">
                              {r.error || r.result || "（还没执行）"}
                            </pre>
                          </div>
                          <div className="md:col-span-2">
                            触发时刻 {r.fireAt || "—"} · 发起人 {ownerLabel(r)} · 发起时间 {r.createdAt || "—"}
                            {r.confirmedBy ? ` · 执行确认人 ${r.confirmedBy}` : ""}
                            {r.sessionId ? ` · 会话 #${r.sessionId}` : ""}
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
