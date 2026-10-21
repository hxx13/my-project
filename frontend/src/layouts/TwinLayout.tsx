import { TwinChromeThemeProvider } from "@/features/twin-chrome/TwinChromeThemeContext";
import { DashboardAutoReturnProvider } from "@/features/twin-chrome/DashboardAutoReturnContext";
import { PrintStationWorkerProvider } from "@/features/print-station/PrintStationWorkerContext";
import TwinLayoutInner from "@/layouts/TwinLayoutInner";

export default function TwinLayout() {
    return (
        <TwinChromeThemeProvider>
            {/* 无人操作自动回大屏：看门狗挂在 Twin 壳里（仪表盘所在的那层），后台管理页不受影响 */}
            <DashboardAutoReturnProvider>
                {/* 工位打印 worker：整层教职工壳都挂着，仪表盘/后台任意页面开着都能领任务并打印 */}
                <PrintStationWorkerProvider>
                    <TwinLayoutInner />
                </PrintStationWorkerProvider>
            </DashboardAutoReturnProvider>
        </TwinChromeThemeProvider>
    );
}
