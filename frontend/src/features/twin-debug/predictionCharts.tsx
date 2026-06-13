import {DASH_NIGHT_CLASS} from "@/features/dashboard-scifi-theme/dashboardNightTokens";
import {cn} from "@/lib/utils";

const DAY_START = 7;
const DAY_END = 22;

export const CombinedMiniCurve = ({entryCurve, exitCurve}: { entryCurve?: number[]; exitCurve?: number[] }) => {
    const width = 210;
    const height = 86;
    const padL = 20;
    const padR = 10;
    const padT = 8;
    const padB = 18;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const entryData = entryCurve?.length === 24 ? entryCurve : null;
    const exitData = exitCurve?.length === 24 ? exitCurve : null;
    if (!entryData || !exitData) {
        return <span className={cn("text-xs", DASH_NIGHT_CLASS.textMuted)}>无曲线</span>;
    }

    const entrySliced = entryData.slice(DAY_START, DAY_END + 1);
    const exitSliced = exitData.slice(DAY_START, DAY_END + 1);
    const maxVal = Math.max(...entrySliced, ...exitSliced, 0.01);
    const nPoints = DAY_END - DAY_START + 1;
    const xAt = (idx: number) => padL + (plotW * idx) / (nPoints - 1);
    const yAt = (val: number) => padT + plotH - (plotH * val) / maxVal;
    const generatePoints = (data: number[]) =>
        data.map((val, idx) => `${xAt(idx)},${yAt(val)}`).join(" ");
    const entryPointsStr = generatePoints(entrySliced);
    const exitPointsStr = generatePoints(exitSliced);
    const tickHours = [7, 10, 13, 16, 19, 22];

    return (
        <div className={cn(DASH_NIGHT_CLASS.panel, "p-1 shadow-sm")}>
            <svg width={width} height={height} className="overflow-visible">
                {tickHours.map((h) => {
                    const idx = h - DAY_START;
                    const x = padL + (plotW * idx) / (nPoints - 1);
                    return (
                        <line
                            key={`vx-${h}`}
                            x1={x}
                            y1={padT}
                            x2={x}
                            y2={padT + plotH}
                            stroke="var(--app-color-border-default)"
                            strokeOpacity={0.45}
                            strokeDasharray="2"
                        />
                    );
                })}
                <polygon
                    points={`${padL},${padT + plotH} ${entryPointsStr} ${padL + plotW},${padT + plotH}`}
                    fill="var(--app-color-scan-chart-stroke-entry)"
                    fillOpacity={0.22}
                />
                <polyline
                    points={entryPointsStr}
                    fill="none"
                    stroke="var(--app-color-scan-chart-stroke-entry)"
                    strokeOpacity={0.88}
                    strokeWidth="1.5"
                />
                <polygon
                    points={`${padL},${padT + plotH} ${exitPointsStr} ${padL + plotW},${padT + plotH}`}
                    fill="var(--app-color-scan-chart-stroke-exit)"
                    fillOpacity={0.22}
                />
                <polyline
                    points={exitPointsStr}
                    fill="none"
                    stroke="var(--app-color-scan-chart-stroke-exit)"
                    strokeOpacity={0.88}
                    strokeWidth="1.5"
                />
                {tickHours.map((h) => {
                    const idx = h - DAY_START;
                    const x = padL + (plotW * idx) / (nPoints - 1);
                    return (
                        <text
                            key={`tx-${h}`}
                            x={x}
                            y={height - 2}
                            textAnchor="middle"
                            fontSize="9"
                            fill="var(--app-color-text-tertiary)"
                        >
                            {h}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
};

export const WeeklyRibbonChart = ({entryCurve, exitCurve}: { entryCurve?: number[]; exitCurve?: number[] }) => {
    const days = ["一", "二", "三", "四", "五", "六", "日"];
    const width = 210;
    const height = 96;
    const padL = 22;
    const padR = 10;
    const padT = 8;
    const padB = 20;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const lowHour = 6;
    const highHour = 22;
    const span = highHour - lowHour;

    if (!entryCurve || entryCurve.length !== 7 || !exitCurve || exitCurve.length !== 7) {
        return (
            <div className={cn(DASH_NIGHT_CLASS.panel, "flex min-h-[60px] items-center justify-center border-dashed")}>
                <span className={cn("text-xs font-bold", DASH_NIGHT_CLASS.textMuted)}>暂无周维度数据</span>
            </div>
        );
    }

    const xAt = (i: number) => padL + (i / (days.length - 1)) * plotW;
    const yAt = (hour: number) => {
        const h = Math.max(lowHour, Math.min(highHour, hour));
        return padT + plotH - ((h - lowHour) / span) * plotH;
    };
    const point = (i: number, h: number) => `${xAt(i)},${yAt(h)}`;
    const entryPoints = days.map((_, i) => point(i, entryCurve[i])).join(" ");
    const exitPoints = days.map((_, i) => point(i, exitCurve[i])).join(" ");
    const ribbonPoints = [
        ...days.map((_, i) => point(i, entryCurve[i])),
        ...days.map((_, i) => point(days.length - 1 - i, exitCurve[days.length - 1 - i])),
    ].join(" ");

    return (
        <div className={cn(DASH_NIGHT_CLASS.panel, "relative p-2 shadow-sm")}>
            <svg width={width} height={height} className="overflow-visible">
                {Array.from({length: days.length}).map((_, i) => (
                    <line
                        key={i}
                        x1={xAt(i)}
                        y1={padT}
                        x2={xAt(i)}
                        y2={padT + plotH}
                        stroke="var(--app-color-border-default)"
                        strokeOpacity={0.4}
                        strokeDasharray="2"
                    />
                ))}
                <polygon points={ribbonPoints} fill="var(--app-color-accent)" fillOpacity={0.14} />
                <polyline
                    points={entryPoints}
                    fill="none"
                    stroke="var(--app-color-scan-chart-stroke-entry)"
                    strokeOpacity={0.88}
                    strokeWidth="1.5"
                />
                <polyline
                    points={exitPoints}
                    fill="none"
                    stroke="var(--app-color-scan-chart-stroke-exit)"
                    strokeOpacity={0.88}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                />
                {days.map((d, i) => (
                    <text
                        key={`dx-${i}`}
                        x={xAt(i)}
                        y={height - 2}
                        textAnchor="middle"
                        fontSize="9"
                        fill="var(--app-color-text-tertiary)"
                    >
                        {d}
                    </text>
                ))}
            </svg>
        </div>
    );
};

export function policyTagLabel(tag?: string): string {
    switch (tag) {
        case "authorized_latest_22":
            return "授权·最晚 22:00";
        case "late_entry_denied":
            return "超时入场·受限";
        case "flex_exit_before_1730":
        default:
            return "17:30 前入场·弹性离场";
    }
}
