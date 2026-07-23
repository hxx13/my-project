import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { LineStats } from "@/api/twinApi";
import { useDashboardVisual } from "@/features/dashboard-scifi-theme/DashboardSciFiVisualContext";
import {
    DASH_NIGHT_CLASS,
    hexToRgba,
    readDashboardNightChartPalette,
} from "@/features/dashboard-scifi-theme/dashboardNightTokens";

interface HubPeakLineChartProps {
    data: LineStats;
}

export function HubPeakLineChart({ data }: HubPeakLineChartProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const visual = useDashboardVisual();

    useEffect(() => {
        if (!chartRef.current || !data) return;

        let chart = echarts.getInstanceByDom(chartRef.current);
        if (!chart) {
            chart = echarts.init(chartRef.current);
        }

        const option = visual.sciFi
            ? {
                  backgroundColor: "transparent",
                  title: {
                      text: "进出高峰枢纽对比",
                      left: "center",
                      top: 10,
                      textStyle: {
                          fontSize: 16,
                          fontWeight: "900",
                          color: "#e0f7fa",
                          textShadowColor: "rgba(56, 189, 248, 0.9)",
                          textShadowBlur: 14,
                      },
                  },
                  tooltip: {
                      trigger: "axis",
                      backgroundColor: "rgba(2, 6, 23, 0.92)",
                      textStyle: { color: "#f1f5f9" },
                      borderColor: "rgba(56, 189, 248, 0.35)",
                      extraCssText: "backdrop-filter: blur(12px);",
                      borderRadius: 12,
                  },
                  legend: {
                      bottom: 0,
                      data: ["浦东", "浦西"],
                      icon: "circle",
                      textStyle: { color: "#94a3b8" },
                  },
                  color: ["#38bdf8", "#e879f9"],
                  grid: { top: "25%", bottom: "15%", left: "5%", right: "5%", containLabel: true },
                  xAxis: {
                      type: "category",
                      data: data.times,
                      axisLine: { lineStyle: { color: "rgba(56, 189, 248, 0.35)" } },
                      axisLabel: { interval: 1, color: "#94a3b8" },
                  },
                  yAxis: {
                      type: "value",
                      axisLine: { show: true, lineStyle: { color: "rgba(56, 189, 248, 0.2)" } },
                      splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.12)" } },
                      axisLabel: { color: "#94a3b8" },
                  },
                  series: [
                      {
                          name: "浦东",
                          type: "line",
                          smooth: true,
                          lineStyle: {
                              width: 3,
                              shadowColor: "rgba(56, 189, 248, 0.85)",
                              shadowBlur: 16,
                          },
                          areaStyle: {
                              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                  { offset: 0, color: "rgba(56, 189, 248, 0.45)" },
                                  { offset: 1, color: "rgba(56, 189, 248, 0.0)" },
                              ]),
                          },
                          data: data.pudong,
                          label: {
                              show: true,
                              position: "top",
                              color: "#7dd3fc",
                              formatter: (p: { value?: number }) => (p.value ?? 0) > 0 ? String(p.value) : "",
                          },
                      },
                      {
                          name: "浦西",
                          type: "line",
                          smooth: true,
                          lineStyle: {
                              width: 3,
                              shadowColor: "rgba(232, 121, 249, 0.85)",
                              shadowBlur: 16,
                          },
                          areaStyle: {
                              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                  { offset: 0, color: "rgba(232, 121, 249, 0.42)" },
                                  { offset: 1, color: "rgba(232, 121, 249, 0.0)" },
                              ]),
                          },
                          data: data.puxi,
                          label: {
                              show: true,
                              position: "top",
                              color: "#f0abfc",
                              formatter: (p: { value?: number }) => (p.value ?? 0) > 0 ? String(p.value) : "",
                          },
                      },
                  ],
              }
            : visual.night
              ? (() => {
                    const p = readDashboardNightChartPalette(chartRef.current?.closest(".dashboard-home-root--night-sky"));
                    return {
                        backgroundColor: "transparent",
                        title: {
                            text: "进出高峰枢纽对比",
                            left: "center",
                            top: 10,
                            textStyle: {
                                fontSize: 15,
                                fontWeight: "800",
                                color: p.accentInk,
                            },
                        },
                        tooltip: {
                            trigger: "axis",
                            backgroundColor: hexToRgba(p.surfaceStudent, 0.92),
                            textStyle: { color: p.accentInk },
                            borderColor: hexToRgba(p.accentWarm, 0.35),
                            extraCssText: "backdrop-filter: blur(10px);",
                            borderRadius: 10,
                        },
                        legend: {
                            bottom: 0,
                            data: ["浦东", "浦西"],
                            icon: "circle",
                            textStyle: { color: p.textMuted },
                        },
                        color: [p.exit, p.entry],
                        grid: { top: "25%", bottom: "15%", left: "5%", right: "5%", containLabel: true },
                        xAxis: {
                            type: "category",
                            data: data.times,
                            axisLine: { lineStyle: { color: hexToRgba(p.accentWarm, 0.22) } },
                            axisLabel: { interval: 1, color: p.textMuted },
                        },
                        yAxis: {
                            type: "value",
                            axisLine: { show: false },
                            splitLine: { lineStyle: { color: hexToRgba(p.accentSteel, 0.12) } },
                            axisLabel: { color: p.textMuted },
                        },
                        series: [
                            {
                                name: "浦东",
                                type: "line",
                                smooth: true,
                                lineStyle: { width: 2, color: p.exit },
                                areaStyle: {
                                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                        { offset: 0, color: hexToRgba(p.exit, 0.32) },
                                        { offset: 1, color: "transparent" },
                                    ]),
                                },
                                data: data.pudong,
                                label: {
                                    show: true,
                                    position: "top",
                                    color: p.textMuted,
                                    formatter: (v: { value?: number }) => (v.value ?? 0) > 0 ? String(v.value) : "",
                                },
                            },
                            {
                                name: "浦西",
                                type: "line",
                                smooth: true,
                                lineStyle: { width: 2, color: p.entry },
                                areaStyle: {
                                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                        { offset: 0, color: p.chartFill },
                                        { offset: 1, color: "transparent" },
                                    ]),
                                },
                                data: data.puxi,
                                label: {
                                    show: true,
                                    position: "top",
                                    color: p.textMuted,
                                    formatter: (v: { value?: number }) => (v.value ?? 0) > 0 ? String(v.value) : "",
                                },
                            },
                        ],
                    };
                })()
              : {
                  title: {
                      text: "进出高峰枢纽对比",
                      left: "center",
                      top: 10,
                      textStyle: {
                          fontSize: 16,
                          fontWeight: "900",
                          color: "#1d1d1f",
                      },
                  },
                  tooltip: {
                      trigger: "axis",
                      backgroundColor: "rgba(15, 23, 42, 0.9)",
                      textStyle: { color: "#f8fafc" },
                      borderColor: "rgba(255,255,255,0.1)",
                      extraCssText: "backdrop-filter: blur(10px);",
                      borderRadius: 12,
                  },
                  legend: {
                      bottom: 0,
                      data: ["浦东", "浦西"],
                      icon: "circle",
                      textStyle: { color: "#94a3b8" },
                  },
                  color: ["#42A5F5", "#AB47BC"],
                  grid: { top: "25%", bottom: "15%", left: "5%", right: "5%", containLabel: true },
                  xAxis: {
                      type: "category",
                      data: data.times,
                      axisLabel: { interval: 1, color: "#94a3b8" },
                  },
                  yAxis: {
                      type: "value",
                      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
                      axisLabel: { color: "#94a3b8" },
                  },
                  series: [
                      {
                          name: "浦东",
                          type: "line",
                          smooth: true,
                          lineStyle: { width: 3, shadowColor: "rgba(66, 165, 245, 0.6)", shadowBlur: 10 },
                          areaStyle: {
                              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                  { offset: 0, color: "rgba(66, 165, 245, 0.4)" },
                                  { offset: 1, color: "rgba(66, 165, 245, 0.0)" },
                              ]),
                          },
                          data: data.pudong,
                          label: {
                              show: true,
                              position: "top",
                              color: "#42A5F5",
                              formatter: (p: { value?: number }) => (p.value ?? 0) > 0 ? String(p.value) : "",
                          },
                      },
                      {
                          name: "浦西",
                          type: "line",
                          smooth: true,
                          lineStyle: { width: 3, shadowColor: "rgba(171, 71, 188, 0.6)", shadowBlur: 10 },
                          areaStyle: {
                              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                                  { offset: 0, color: "rgba(171, 71, 188, 0.4)" },
                                  { offset: 1, color: "rgba(171, 71, 188, 0.0)" },
                              ]),
                          },
                          data: data.puxi,
                          label: {
                              show: true,
                              position: "top",
                              color: "#AB47BC",
                              formatter: (p: { value?: number }) => (p.value ?? 0) > 0 ? String(p.value) : "",
                          },
                      },
                  ],
              };

        chart.setOption(option, { notMerge: true });

        const handleResize = () => chart.resize();
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [data, visual.sciFi, visual.night]);

    return (
        <div
            ref={chartRef}
            className={`w-full h-full ${visual.night ? DASH_NIGHT_CLASS.chartArea : ""}`}
        />
    );
}
