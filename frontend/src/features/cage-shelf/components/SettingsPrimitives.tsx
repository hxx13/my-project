import type { ReactNode } from "react";
import type { CageStatusAlertAction } from "@/api/domains/cageShelf.api";

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

/** 紧凑分段控件（动作 / 计时起点共用）：令牌配色，尺寸对齐设置行的右侧控件位。 */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string; title?: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.title}
          className={`flex-1 rounded-twin-md px-1.5 py-1 text-[10px] font-semibold transition ${
            value === o.value ? "bg-[var(--twin-primary)] text-white" : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const ACTION_LABEL: Record<CageStatusAlertAction, string> = {
  HIGHLIGHT: "仅高亮",
  VIOLATION: "仅违规",
  BOTH: "高亮+违规",
};

const ACTIONS: CageStatusAlertAction[] = ["HIGHLIGHT", "VIOLATION", "BOTH"];

/** 非违规状态（特殊饲养/合笼/明细）的档位说明：它们的「违规」档实际只会发通知，不建违规记录。 */
export const NON_VIOLATION_HINT =
  "该状态不属于违规行为：选到「通知」档按推送中心「笼位状态提醒」发通知，不产生违规记录";

/**
 * 非违规状态的档位名 —— 同一套 action 值（服务端语义不变），只是把「违规」改说成「通知」：
 * 这两个状态到阈值本就只发通知，界面还写「仅违规/高亮+违规」会让人以为在建违规记录。
 */
export const ACTION_LABEL_NON_VIOLATION: Record<CageStatusAlertAction, string> = {
  HIGHLIGHT: "仅高亮",
  VIOLATION: "仅通知",
  BOTH: "高亮+通知",
};

/** 触发动作三选一。`nonViolation=true`：把违规档改名为通知档（特殊饲养/合笼/明细）。 */
export function ActionPicker({
  value,
  onChange,
  nonViolation = false,
}: {
  value: CageStatusAlertAction;
  onChange: (a: CageStatusAlertAction) => void;
  /** 该状态不属于违规行为（特殊饲养/合笼/明细）→ 档位文案显示为「通知」并给出说明。 */
  nonViolation?: boolean;
}) {
  const labels = nonViolation ? ACTION_LABEL_NON_VIOLATION : ACTION_LABEL;
  return (
    <Segmented
      options={ACTIONS.map((a) => ({
        value: a,
        label: labels[a],
        title: nonViolation ? NON_VIOLATION_HINT : undefined,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}

const START_VALUES: Array<0 | 1> = [1, 0];
/** 计时起点：从哪一侧的变化开始量时长（另一侧就是结束）。标签写业务动作，不写 1/0。 */
export const START_VALUE_LABEL: Record<0 | 1, string> = {
  1: "置为后计时",
  0: "取消后计时",
};
/** 一句小字把两个边都写出来，省得用户去猜「结束按哪边算」。 */
export const START_VALUE_HINT: Record<0 | 1, string> = {
  1: "置为这个状态后开始计时，满阈值天数就通知",
  0: "取消这个状态后开始计时，满阈值天数就通知",
};

/** 计时起点二选一；默认取「置为后计时」（各调用方都是 `startValue ?? 1`）。 */
export function StartValuePicker({
  value,
  onChange,
}: {
  value: 0 | 1;
  onChange: (v: 0 | 1) => void;
}) {
  return (
    <Segmented
      options={START_VALUES.map((v) => ({ value: v, label: START_VALUE_LABEL[v], title: START_VALUE_HINT[v] }))}
      value={value}
      onChange={onChange}
    />
  );
}
