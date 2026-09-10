import type { ReactNode } from "react";

/**
 * 设置项布尔开关 —— 令牌配色（亮/暗一致），尺寸对齐设置行右侧控件位。
 * 不用 ThemeAnimatedSwitch：那个是太阳/月亮/星星的主题切换装饰件，不适合后台设置行。
 */
export function SettingsSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-[var(--twin-primary)]" : "bg-[var(--twin-hairline)]"
      }`}
    >
      <span
        className={`pointer-events-none block size-4 rounded-full ring-1 ring-[var(--twin-hairline)] transition-transform ${
          checked ? "translate-x-[1.125rem] bg-[var(--twin-canvas)]" : "translate-x-0.5 bg-[var(--twin-canvas)]"
        }`}
      />
    </button>
  );
}

/** 设置分组标题：统一各面板的小节框架（标题 + 说明 + 内容）。 */
export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[12px] font-semibold text-[var(--twin-ink)]">{title}</h4>
          {description && <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--twin-mute)]">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** 设置行：左标签/说明，右控件。 */
export function SettingsRow({
  label,
  description,
  children,
}: {
  label: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-[var(--twin-ink)]">{label}</div>
        {description && <div className="mt-0.5 text-[10px] text-[var(--twin-mute)]">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
