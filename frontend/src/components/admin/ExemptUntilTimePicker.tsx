import {
    DEFAULT_EXEMPT_UNTIL_TIME,
    EXEMPT_UNTIL_TIME_PRESETS,
    formatExemptUntilLabel,
} from "@/constants/exemptDurationPresets";
import { cn } from "@/lib/utils";

type Props = {
    value: string;
    onChange: (untilTime: string) => void;
    disabled?: boolean;
    className?: string;
};

/** 豁免「延长至几点」— 30 分钟一档，大按钮方便点击 */
export function ExemptUntilTimePicker({ value, onChange, disabled, className }: Props) {
    const selected = value?.trim() || DEFAULT_EXEMPT_UNTIL_TIME;
    return (
        <div className={cn("grid grid-cols-3 sm:grid-cols-4 gap-2", className)}>
            {EXEMPT_UNTIL_TIME_PRESETS.map((preset) => {
                const active = preset.untilTime === selected;
                const isDefault = preset.untilTime === DEFAULT_EXEMPT_UNTIL_TIME;
                return (
                    <button
                        key={preset.untilTime}
                        type="button"
                        disabled={disabled}
                        title={formatExemptUntilLabel(preset.untilTime)}
                        className={cn(
                            "min-h-[44px] rounded-xl border px-2 py-2.5 text-sm font-bold transition-colors",
                            active
                                ? "border-amber-400 bg-amber-100 text-amber-900"
                                : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-[var(--app-color-text-secondary)] hover:border-amber-300 hover:bg-amber-50",
                            disabled && "opacity-50 cursor-not-allowed",
                        )}
                        onClick={() => onChange(preset.untilTime)}
                    >
                        {preset.untilTime}
                        {isDefault ? (
                            <span className="mt-0.5 block text-[10px] font-medium opacity-70">默认</span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}
