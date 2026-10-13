import { TwinChromeThemeProvider } from "@/features/twin-chrome/TwinChromeThemeContext";
import { DashboardAutoReturnProvider } from "@/features/twin-chrome/DashboardAutoReturnContext";
import TwinLayoutInner from "@/layouts/TwinLayoutInner";

export default function TwinLayout() {
    return (
        <TwinChromeThemeProvider>
            {/* 无人操作自动回大屏：看门狗挂在 Twin 壳里（仪表盘所在的那层），后台管理页不受影响 */}
            <DashboardAutoReturnProvider>
                <TwinLayoutInner />
            </DashboardAutoReturnProvider>
        </TwinChromeThemeProvider>
    );
}
