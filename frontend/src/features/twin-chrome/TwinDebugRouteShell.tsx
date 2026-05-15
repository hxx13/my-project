import type { ReactNode } from "react";
import { useTwinChromeTheme } from "@/features/twin-chrome/TwinChromeThemeContext";
import "@/features/twin-chrome/twinDebugSciFiShell.css";

export function TwinDebugRouteShell({ title, children }: { title: string; children: ReactNode }) {
    const { themeId } = useTwinChromeTheme();
    if (themeId !== "dashboardSciFi") {
        return children;
    }
    return (
        <div className="twin-debug-scifi-shell flex h-full min-h-0 w-full flex-col">
            <div className="twin-debug-scifi-shell__frame">
                <div className="twin-debug-scifi-shell__corners" role="presentation" aria-hidden />
                <header className="twin-debug-scifi-shell__header">{title}</header>
                <div className="twin-debug-scifi-shell__body flex min-h-0 flex-1 flex-col">{children}</div>
                <div className="twin-debug-scifi-shell__scanlines" role="presentation" aria-hidden />
            </div>
        </div>
    );
}
