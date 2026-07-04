import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export type TwinChromeMenuSwitchProps = {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
    "aria-label"?: string;
    "aria-labelledby"?: string;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

/** Compact toggle for Twin Chrome context menu rows (dark slate + cyan accent). */
export function TwinChromeMenuSwitch({
    checked,
    onCheckedChange,
    disabled,
    className,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    onClick,
}: TwinChromeMenuSwitchProps) {
    return (
        <SwitchPrimitive.Root
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            onClick={onClick}
            className={cn(
                "mt-0.5 inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-150",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-400/70",
                "disabled:cursor-not-allowed disabled:opacity-50",
                checked ? "bg-cyan-500" : "bg-slate-700",
                className
            )}
        >
            <SwitchPrimitive.Thumb
                className={cn(
                    "block h-3 w-3 rounded-full bg-slate-100 shadow-sm transition-transform duration-150",
                    "data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0.5"
                )}
            />
        </SwitchPrimitive.Root>
    );
}
