import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TwinWebChromeThemeId } from "@/api/domains/me.api";
import { TWIN_THEME_MENU_ROWS } from "./twinChromeMenu.config";

export function TwinThemePickerPanel({
    themeId,
    onPick,
    dense,
}: {
    themeId: TwinWebChromeThemeId;
    onPick: (id: TwinWebChromeThemeId) => void;
    dense?: boolean;
}) {
    return (
        <div className={cn("flex flex-col gap-0.5", dense ? "p-1" : "p-1.5")}>
            {TWIN_THEME_MENU_ROWS.map((row, i) => {
                if (row.kind === "placeholder") {
                    return (
                        <div
                            key={`ph-${i}`}
                            className="rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500"
                        >
                            {row.label}
                        </div>
                    );
                }
                const active = themeId === row.id;
                return (
                    <button
                        key={row.id}
                        type="button"
                        onClick={() => onPick(row.id)}
                        className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                            active ? "bg-cyan-600/25 text-cyan-100" : "text-slate-100 hover:bg-white/10"
                        )}
                    >
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                            {active ? <Check className="h-3 w-3 text-cyan-300" aria-hidden /> : null}
                        </span>
                        <span className="font-medium">{row.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
