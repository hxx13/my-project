/**
 * MonitorHealthCards — 服务健康卡片 + 活跃连接
 *
 * 5 个卡片 Bento grid 排列，每个卡片显示服务名 + 状态 LED + 关键指标。
 * 状态: UP (绿) / DEGRADED (琥珀) / DOWN (红) / UNKNOWN (灰)
 *
 * 下方附加"活跃连接"区块，展示当前 Socket.IO 客户端会话概况。
 *
 * 遵循 Impeccable 产品规则: 无 emoji 指示器，用语义颜色 LED + 文字标签。
 * 全部颜色通过 var(--app-color-*) 令牌引用。
 */

import { useState, type ReactNode } from "react";
import type { HealthItem, SessionSnapshot } from "@/api/domains/monitor.api";
import { useMonitorStore } from "@/store/useMonitorStore";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════
// 工具
// ═══════════════════════════════════════════

const dotBase = "h-3 w-3 rounded-full shrink-0";

function statusDot(status: HealthItem["status"]) {
  switch (status) {
    case "UP":
      return cn(dotBase, "bg-[var(--app-color-feedback-success)]");
    case "DEGRADED":
      return cn(dotBase, "bg-[var(--app-color-feedback-warning)] motion-safe:animate-pulse");
    case "DOWN":
      return cn(dotBase, "bg-[var(--app-color-feedback-danger)]");
    default:
      return cn(dotBase, "bg-[var(--app-color-text-tertiary)]");
  }
}

function statusLabel(status: HealthItem["status"]): string {
  switch (status) {
    case "UP":        return "运行中";
    case "DEGRADED":  return "降级";
    case "DOWN":      return "异常";
    default:          return "未知";
  }
}

function statusBadgeClass(status: HealthItem["status"]) {
  switch (status) {
    case "UP":
      return "bg-[var(--app-color-feedback-success-soft)] text-[var(--app-color-feedback-success)]";
    case "DEGRADED":
      return "bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]";
    case "DOWN":
      return "bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger)]";
    default:
      return "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]";
  }
}

function findItem(items: HealthItem[], label: string): HealthItem | undefined {
  return items.find((i) => i.label === label);
}

/** 将后端 Spring Boot detail "0d 12h 5m 端口:8080" 转为 "运行 0d 12h 5m · 端口 8080" */
function formatSpringDetail(detail: string): string {
  return "运行 " + detail.replace("端口:", "· 端口 ");
}

/** 追加响应耗时: "8/20 连接 · 5ms" */
function formatWithMs(detail: string, responseMs: number): string {
  return detail + " · " + responseMs + "ms";
}

// ═══════════════════════════════════════════
// 卡片组件
// ═══════════════════════════════════════════

function cardBorderClass(status: HealthItem["status"]) {
  return status === "DOWN" || status === "DEGRADED"
    ? "border-[var(--app-color-feedback-danger)]/30"
    : "border-[var(--app-color-border-default)]";
}

function ErrorPopover({ message, children }: { message?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!message) return <>{children}</>;
  return (
    <span className="relative inline-flex">
      <span onClick={() => setOpen(!open)} onBlur={() => setOpen(false)} className="cursor-pointer">
        {children}
      </span>
      {open ? (
        <div className="absolute right-0 top-full mt-1 z-[var(--z-tooltip)] max-w-[min(90vw,420px)] w-max rounded-lg border border-[var(--app-color-feedback-danger)]/30 bg-[var(--app-color-surface-elevated)] p-3 shadow-[var(--app-elevation-dropdown)]">
          <p className="text-xs text-[var(--app-color-feedback-danger)] break-all leading-relaxed max-h-[240px] overflow-auto">{message}</p>
        </div>
      ) : null}
    </span>
  );
}

function SpringBootCard({ item }: { item: HealthItem }) {
  return (
    <div className={cn("rounded-xl border bg-[var(--app-color-surface-container)] p-5 shadow-sm", cardBorderClass(item.status))}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className={statusDot(item.status)} />
        <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{item.label}</span>
        <span className={cn("text-xs font-medium rounded-full px-2 py-0.5", statusBadgeClass(item.status))}>
          {statusLabel(item.status)}
        </span>
      </div>
      <p className="text-sm text-[var(--app-color-text-secondary)]">{formatSpringDetail(item.detail)}</p>
    </div>
  );
}

function MysqlCard({ item }: { item: HealthItem }) {
  const isDown = item.status === "DOWN";
  return (
    <div className={cn("rounded-xl border bg-[var(--app-color-surface-container)] p-5 shadow-sm", cardBorderClass(item.status))}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className={statusDot(item.status)} />
        <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{item.label}</span>
        <ErrorPopover message={item.error}>
          <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 cursor-pointer", statusBadgeClass(item.status))}>
            {statusLabel(item.status)}
          </span>
        </ErrorPopover>
      </div>
      <p className="text-sm text-[var(--app-color-text-secondary)]">
        {formatWithMs(item.detail, item.responseMs)}
      </p>
    </div>
  );
}

function SocketIoCard({ item }: { item: HealthItem }) {
  const detail = item.totalClients != null
    ? item.totalClients + " 客户端 (Web: " + (item.webClients ?? 0) + ", Mobile: " + (item.mobileClients ?? 0) + ")"
    : item.detail;

  return (
    <div className={cn("rounded-xl border bg-[var(--app-color-surface-container)] p-5 shadow-sm", cardBorderClass(item.status))}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className={statusDot(item.status)} />
        <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{item.label}</span>
        <ErrorPopover message={item.error}>
          <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 cursor-pointer", statusBadgeClass(item.status))}>
            {statusLabel(item.status)}
          </span>
        </ErrorPopover>
      </div>
      <p className="text-sm text-[var(--app-color-text-secondary)]">{detail}</p>
    </div>
  );
}

function CosyVoiceCard({ item }: { item: HealthItem }) {
  return (
    <div className={cn("rounded-xl border bg-[var(--app-color-surface-container)] p-5 shadow-sm", cardBorderClass(item.status))}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className={statusDot(item.status)} />
        <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{item.label}</span>
        <ErrorPopover message={item.error}>
          <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 cursor-pointer", statusBadgeClass(item.status))}>
            {statusLabel(item.status)}
          </span>
        </ErrorPopover>
      </div>
      <p className="text-sm text-[var(--app-color-text-secondary)]">
        {formatWithMs(item.detail, item.responseMs)}
      </p>
    </div>
  );
}

function NginxCard({ item }: { item: HealthItem }) {
  const isDown = item.status === "DOWN";
  return (
    <div className={cn("rounded-xl border bg-[var(--app-color-surface-container)] p-5 shadow-sm", cardBorderClass(item.status))}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className={statusDot(item.status)} />
        <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">{item.label}</span>
        <ErrorPopover message={item.error}>
          <span className={cn("text-xs font-medium rounded-full px-2 py-0.5 cursor-pointer", statusBadgeClass(item.status))}>
            {statusLabel(item.status)}
          </span>
        </ErrorPopover>
      </div>
      <p className="text-sm text-[var(--app-color-text-secondary)]">
        {formatWithMs(item.detail, item.responseMs)}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════
// 活跃连接区块
// ═══════════════════════════════════════════

export function ActiveSessionsSection({ sessions }: { sessions: SessionSnapshot }) {
  const top5 = sessions.socketClients.slice(0, 5);

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">
        活跃连接
      </h3>
      <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-5 shadow-sm">
        {/* 统计摘要 */}
        <div className="flex items-center gap-6 mb-3">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-[var(--app-color-text-primary)]">{sessions.totalClients}</span>
            <span className="text-xs text-[var(--app-color-text-tertiary)]">总连接数</span>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-[var(--app-color-text-primary)]">{sessions.webCount}</span>
            <span className="text-xs text-[var(--app-color-text-tertiary)]">Web</span>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-[var(--app-color-text-primary)]">{sessions.mobileCount}</span>
            <span className="text-xs text-[var(--app-color-text-tertiary)]">Mobile</span>
          </div>
        </div>

        {/* 客户端列表 */}
        {top5.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-[var(--app-color-text-tertiary)] mb-2">最近客户端</p>
            <ul className="space-y-1.5">
              {top5.map((c, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-[var(--app-color-text-secondary)]">
                  <span className="font-mono">{c.ip}</span>
                  {c.userName ? (
                    <span className="text-[var(--app-color-text-tertiary)]">{c.userName}</span>
                  ) : c.userId ? (
                    <span className="text-[var(--app-color-text-tertiary)]">{c.userId}</span>
                  ) : null}
                  <span className={cn(
                    "ml-auto rounded px-1.5 py-0.5 text-[11px]",
                    c.channel === "mobile"
                      ? "bg-[var(--app-color-feedback-warning-soft)] text-[var(--app-color-feedback-warning)]"
                      : "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]",
                  )}>
                    {c.channel === "mobile" ? "Mobile" : "Web"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-[var(--app-color-text-tertiary)]">暂无活跃客户端</p>
        )}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════

export function MonitorHealthCards() {
  const items = useMonitorStore((s) => s.healthItems);
  const loading = useMonitorStore((s) => s.healthLoading);
  const error = useMonitorStore((s) => s.healthError);

  // 防御：加载中无数据时不渲染
  if (loading && items.length === 0) return null;
  if (error && items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--app-color-feedback-danger)]/30 bg-[var(--app-color-feedback-danger-soft)] p-5 text-sm text-[var(--app-color-feedback-danger)]">
        健康检查加载失败: {error}
      </div>
    );
  }

  const spring = findItem(items, "Spring Boot");
  const mysql = findItem(items, "MySQL");
  const socket = findItem(items, "Socket.IO");
  const cosy = findItem(items, "CosyVoice");
  const nginx = findItem(items, "Nginx");

  return (
    <div className="flex flex-col gap-[var(--app-space-section-gap)]">
      {/* ═══ 系统健康卡片 ═══ */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--app-color-text-secondary)]">
          系统健康
        </h3>
        <div className="grid gap-[var(--app-space-element-gap)] grid-cols-2 lg:grid-cols-5">
          {spring ? <SpringBootCard item={spring} /> : null}
          {mysql  ? <MysqlCard item={mysql} /> : null}
          {socket ? <SocketIoCard item={socket} /> : null}
          {cosy   ? <CosyVoiceCard item={cosy} /> : null}
          {nginx  ? <NginxCard item={nginx} /> : null}
        </div>
      </section>

    </div>
  );
}
