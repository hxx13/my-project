import { type ReactNode } from 'react';

/** 信息卡片数据行 */
export type InfoRow = {
  label: string;
  value: string | number;
  unit?: string;
  /** 可选：数值高亮色（如温度偏高用红色） */
  highlight?: 'normal' | 'warn' | 'danger';
  /** 可选：趋势图标 */
  trend?: 'up' | 'down' | 'stable';
};

/** 信息卡片 Props */
export type InfoCardProps = {
  /** 卡片标题（如房间名） */
  title: string;
  /** 副标题（如 Room / Door / Device） */
  subtitle?: string;
  /** 数据行 */
  rows?: InfoRow[];
  /** 自定义底部内容（如操作按钮） */
  footer?: ReactNode;
  /** 关闭回调 */
  onClose?: () => void;
  /** 自定义宽度 className */
  className?: string;
};

const HIGHLIGHT_MAP = {
  normal: 'text-[var(--app-color-text-primary)]',
  warn: 'text-amber-500',
  danger: 'text-red-500',
};

const TREND_ICON = {
  up: '↑',
  down: '↓',
  stable: '→',
};

export function InfoCard({ title, subtitle, rows, footer, onClose, className = '' }: InfoCardProps) {
  return (
    <div
      className={`bg-[var(--app-color-surface-elevated)]/95 backdrop-blur-md border border-[var(--app-color-border-default)] shadow-2xl rounded-2xl pointer-events-auto overflow-hidden ${className}`}
      style={{ minWidth: 300, maxWidth: 420 }}
    >
      {/* 头部 */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <div className="font-bold text-base text-[var(--app-color-text-primary)] truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-xs text-[var(--app-color-text-secondary)] mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-page)] hover:text-[var(--app-color-text-primary)] transition-colors text-sm"
            aria-label="关闭"
          >
            ✕
          </button>
        )}
      </div>

      {/* 数据行 */}
      {rows && rows.length > 0 && (
        <div className="px-5 pb-3.5">
          <div className="border-t border-[var(--app-color-border-subtle)]/50 pt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            {rows.map((row, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-[11px] text-[var(--app-color-text-secondary)] leading-tight">
                  {row.label}
                </span>
                <span className={`text-lg font-bold tabular-nums flex items-center gap-1 ${HIGHLIGHT_MAP[row.highlight || 'normal']}`}>
                  {row.value}
                  {row.unit && <span className="text-[11px] font-normal opacity-60">{row.unit}</span>}
                  {row.trend && (
                    <span className="text-xs ml-0.5 opacity-70">{TREND_ICON[row.trend]}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 底部 */}
      {footer && (
        <div className="px-5 pb-3.5 border-t border-[var(--app-color-border-subtle)]/50 pt-3">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * 预设：房间信息卡片。
 * 展示温度、湿度等传感器数据。数据通过 rows 传入，业务层负责填充。
 */
export function RoomInfoCard(props: {
  roomName: string;
  roomType: string;
  temperature?: number;
  humidity?: number;
  onClose: () => void;
}) {
  const rows: InfoRow[] = [];
  if (props.temperature !== undefined) {
    const highlight = props.temperature > 30 ? 'danger' : props.temperature > 26 ? 'warn' : 'normal';
    rows.push({ label: '温度', value: props.temperature.toFixed(1), unit: '°C', highlight, trend: 'stable' });
  }
  if (props.humidity !== undefined) {
    rows.push({ label: '湿度', value: props.humidity.toFixed(1), unit: '%', trend: 'stable' });
  }
  // 如果没有任何传感器数据，显示占位
  if (rows.length === 0) {
    rows.push({ label: '状态', value: '在线' });
  }
  return (
    <InfoCard
      title={props.roomName}
      subtitle={props.roomType}
      rows={rows}
      onClose={props.onClose}
    />
  );
}
