import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { fetchPieChartData } from "@/api/twinApi";
import type { DashboardStatsResponse } from "@/api/twinApi";
import { useEventStore } from "@/store/useEventStore";
import { MapPin, Loader2 } from "lucide-react";
import { useDashboardSciFiVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";

const PD_COLORS = ["#2d5cf7", "#5b82ff", "#8faeff", "#c2d5ff", "#e0eaff"];
const PX_COLORS = ["#8e44ad", "#a55ebf", "#bf7fd3", "#d8a3e6", "#efccf8"];
const PD_COLORS_SF = ["#38bdf8", "#22d3ee", "#67e8f9", "#a5f3fc", "#cffafe"];
const PX_COLORS_SF = ["#c084fc", "#e879f9", "#f0abfc", "#f5d0fe", "#fae8ff"];

export function NestedPieChart() {
    const pieStats = useEventStore((state) => state.pieStats);
    const setPieStats = useEventStore((state) => state.setPieStats);
    const [isColdStarting, setIsColdStarting] = useState(true);
    const sciFi = useDashboardSciFiVisual();

    useEffect(() => {
        const loadInitialPie = async () => {
            if (pieStats) {
                setIsColdStarting(false);
                return;
            }
            try {
                const initialData = (await fetchPieChartData()) as DashboardStatsResponse;
                setPieStats(initialData);
            } catch (error) {
                console.error("饼图初始数据拉取失败", error);
            } finally {
                setIsColdStarting(false);
            }
        };
        loadInitialPie();
    }, [pieStats, setPieStats]);

    const totalPD = pieStats?.pudongTotal || 0;
    const totalPX = pieStats?.puxiTotal || 0;
    const hasPudongData = Boolean(pieStats?.pudongPie && pieStats.pudongPie.length > 0);
    const hasPuxiData = Boolean(pieStats?.puxiPie && pieStats.puxiPie.length > 0);

    const option = useMemo(() => {
        const emptyPuxi = [
            {
                name: "浦西暂无数据",
                value: 1,
                itemStyle: {
                    color: sciFi ? "rgba(192,132,252,0.12)" : "rgba(142,68,173,0.08)",
                    borderColor: sciFi ? "rgba(192,132,252,0.45)" : "rgba(142,68,173,0.3)",
                    borderWidth: 1,
                    borderType: "dashed" as const,
                },
                tooltip: { show: false },
                label: { show: false },
                labelLine: { show: false },
            },
        ];
        const emptyPudong = [
            {
                name: "浦东暂无数据",
                value: 1,
                itemStyle: {
                    color: sciFi ? "rgba(56,189,248,0.12)" : "rgba(45,92,247,0.08)",
                    borderColor: sciFi ? "rgba(56,189,248,0.45)" : "rgba(45,92,247,0.3)",
                    borderWidth: 1,
                    borderType: "dashed" as const,
                },
                tooltip: { show: false },
                label: { show: false },
                labelLine: { show: false },
            },
        ];

        const sliceBorder = sciFi ? "rgba(2, 6, 23, 0.92)" : "#ffffff";
        const labelColor = sciFi ? "#cbd5e1" : "#475569";
        const labelLineColor = sciFi ? "rgba(56, 189, 248, 0.45)" : "#cbd5e1";

        return {
            tooltip: {
                trigger: "item" as const,
                backgroundColor: sciFi ? "rgba(2, 6, 23, 0.92)" : "rgba(255,255,255,0.9)",
                extraCssText: sciFi
                    ? "backdrop-filter: blur(12px); box-shadow: 0 8px 32px rgba(56,189,248,0.15);"
                    : "backdrop-filter: blur(10px); box-shadow: 0 4px 15px rgba(0,0,0,0.1);",
                borderRadius: 12,
                borderColor: sciFi ? "rgba(56, 189, 248, 0.35)" : "rgba(0,0,0,0.05)",
                textStyle: { color: sciFi ? "#e2e8f0" : "#0f172a" },
                formatter: "{b}: {c}次 ({d}%)",
            },
            series: [
                {
                    name: "浦西房间分布",
                    type: "pie" as const,
                    radius: ["20%", "38%"],
                    center: ["50%", "55%"],
                    itemStyle: {
                        borderRadius: 4,
                        borderColor: sliceBorder,
                        borderWidth: 2,
                        shadowBlur: sciFi ? 18 : 10,
                        shadowColor: sciFi ? "rgba(56, 189, 248, 0.35)" : "rgba(0,0,0,0.1)",
                    },
                    label: { show: false },
                    labelLine: { show: false },
                    color: sciFi ? PX_COLORS_SF : PX_COLORS,
                    data: hasPuxiData && pieStats?.puxiPie ? pieStats.puxiPie : emptyPuxi,
                },
                {
                    name: "浦东房间分布",
                    type: "pie" as const,
                    radius: ["48%", "70%"],
                    center: ["50%", "55%"],
                    itemStyle: {
                        borderRadius: 6,
                        borderColor: sliceBorder,
                        borderWidth: 2,
                        shadowBlur: sciFi ? 22 : 15,
                        shadowOffsetX: 2,
                        shadowOffsetY: 2,
                        shadowColor: sciFi ? "rgba(168, 85, 247, 0.35)" : "rgba(0,0,0,0.15)",
                    },
                    label: {
                        show: hasPudongData,
                        fontSize: 11,
                        fontWeight: "bold" as const,
                        color: labelColor,
                        formatter: "{b}",
                    },
                    labelLine: {
                        show: hasPudongData,
                        lineStyle: { color: labelLineColor, width: 1.5 },
                        smooth: 0.3,
                        length: 10,
                        length2: 15,
                    },
                    color: sciFi ? PD_COLORS_SF : PD_COLORS,
                    data: hasPudongData && pieStats?.pudongPie ? pieStats.pudongPie : emptyPudong,
                },
            ],
        };
    }, [sciFi, hasPudongData, hasPuxiData, pieStats]);

    if (isColdStarting)
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        );

    const legendShell = sciFi
        ? "bg-slate-950/75 px-2 py-1 rounded-[12px] border border-cyan-500/30 backdrop-blur-md z-10 shadow-[0_0_24px_rgba(56,189,248,0.2)]"
        : "bg-white/70 px-2 py-1 rounded-[12px] border border-white/80 backdrop-blur-md z-10 shadow-[0_4px_10px_rgba(0,0,0,0.05)]";

    return (
        <div className="w-full h-full relative">
            <div className={`absolute top-0 right-0 flex items-center gap-2 ${legendShell}`}>
                <div
                    className={`flex items-center gap-1 font-bold text-[11px] ${
                        sciFi ? "text-cyan-300" : "text-[#2d5cf7]"
                    }`}
                >
                    <MapPin className="w-3 h-3" /> 浦东:{" "}
                    <span className="text-[12px] font-black">{totalPD}</span>
                </div>
                <div className={`w-[1px] h-3 ${sciFi ? "bg-cyan-500/30" : "bg-black/10"}`} />
                <div
                    className={`flex items-center gap-1 font-bold text-[11px] ${
                        sciFi ? "text-fuchsia-300" : "text-[#8e44ad]"
                    }`}
                >
                    <MapPin className="w-3 h-3" /> 浦西:{" "}
                    <span className="text-[12px] font-black">{totalPX}</span>
                </div>
            </div>
            <ReactECharts key={sciFi ? "sf" : "std"} option={option} style={{ height: "100%", width: "100%" }} />
        </div>
    );
}
