import {useMemo, useState} from "react";
import {ChevronDown, ChevronUp} from "lucide-react";
import {DebugPersonCardShell} from "./DebugPersonCardShell";
import {CombinedMiniCurve, WeeklyRibbonChart, policyTagLabel} from "./predictionCharts";
import {DASH_NIGHT_CLASS} from "@/features/dashboard-scifi-theme/dashboardNightTokens";
import {cn} from "@/lib/utils";
import type {DebugPredictionRoomDto, DebugPredictionUserDto} from "@/api/twinApi";

const VISIBLE_ROOMS = 3;

function formatDuration(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function topNextDest(next: Record<string, unknown> | undefined): string {
    if (!next || Object.keys(next).length === 0) return "-";
    const sorted = Object.entries(next).sort((a, b) => Number(b[1]) - Number(a[1]));
    const [k, v] = sorted[0];
    const label = k === "EXIT" ? "离开大楼" : k;
    return `${label} ${Math.round(Number(v) * 100)}%`;
}

export function DebugPredictionPersonCard({user}: { user: DebugPredictionUserDto }) {
    const [expandedRooms, setExpandedRooms] = useState(false);
    const [chartsOpen, setChartsOpen] = useState(false);

    const rooms = useMemo(() => {
        const raw = user.rooms ?? [];
        const seen = new Set<string>();
        return raw.filter((r) => {
            if (!r.roomId || seen.has(r.roomId)) return false;
            seen.add(r.roomId);
            return true;
        });
    }, [user.rooms]);
    const primary = rooms[0];
    const policyLabel = policyTagLabel(primary?.policyTag);
    const avgDuration = useMemo(() => {
        if (!rooms.length) return 0;
        const sum = rooms.reduce((s, r) => s + (r.medianDurationMins ?? 0), 0);
        return Math.round(sum / rooms.length);
    }, [rooms]);

    const visible = expandedRooms ? rooms : rooms.slice(0, VISIBLE_ROOMS);
    const hiddenCount = Math.max(0, rooms.length - VISIBLE_ROOMS);

    const aggEntry = useMemo(() => {
        const curves = rooms.map((r) => r.entryCurve).filter((c): c is number[] => !!c && c.length === 24);
        if (!curves.length) return undefined;
        const out = new Array(24).fill(0);
        curves.forEach((c) => c.forEach((v, i) => { out[i] += v; }));
        return out.map((v) => v / curves.length);
    }, [rooms]);

    const aggExit = useMemo(() => {
        const curves = rooms.map((r) => r.exitCurve).filter((c): c is number[] => !!c && c.length === 24);
        if (!curves.length) return undefined;
        const out = new Array(24).fill(0);
        curves.forEach((c) => c.forEach((v, i) => { out[i] += v; }));
        return out.map((v) => v / curves.length);
    }, [rooms]);

    return (
        <DebugPersonCardShell
            name={user.userName ?? user.userId}
            userId={user.userId}
            badges={
                <>
                    {user.hasOfficialRoomPermission ? (
                        <span className={cn(DASH_NIGHT_CLASS.chipSuccess, "rounded-full px-2 py-0.5 text-[10px] font-bold")}>官方可进</span>
                    ) : (
                        <span className={cn(DASH_NIGHT_CLASS.chipMuted, "rounded-full px-2 py-0.5 text-[10px] font-bold")}>普通</span>
                    )}
                    <span className={cn(DASH_NIGHT_CLASS.chipSteel, "rounded-full px-2 py-0.5 text-[10px] font-bold")}>
                        {rooms.length} 个房间
                    </span>
                    <span className={cn(DASH_NIGHT_CLASS.chipWarn, "rounded-full px-2 py-0.5 text-[10px] font-bold")}>Lv.{user.level ?? 1}</span>
                </>
            }
        >
            {primary ? (
                <div className={cn(DASH_NIGHT_CLASS.panel, "mb-2 px-2 py-1.5 text-[11px]")}>
                    <div className="flex flex-wrap items-center justify-between gap-1 font-bold text-[var(--app-color-text-secondary)]">
                        <span className="text-[var(--app-color-accent-secondary)]">{primary.peakEntryTime || "—"}</span>
                        <span className={DASH_NIGHT_CLASS.textMuted}>→</span>
                        <span>{formatDuration(avgDuration)}</span>
                        <span className={DASH_NIGHT_CLASS.textMuted}>→</span>
                        <span className="text-[var(--app-color-feedback-warning)]">{primary.predictedExitLabel ?? primary.predictedExitTime ?? "—"}</span>
                    </div>
                    <div className={cn("mt-0.5 text-[10px]", DASH_NIGHT_CLASS.textMuted)}>{policyLabel}</div>
                </div>
            ) : null}

            <div className="space-y-1.5">
                {visible.map((room: DebugPredictionRoomDto) => {
                    const prob = (room.overtimeProb ?? 0) * 100;
                    const high = prob > 60;
                    return (
                        <div
                            key={`${user.userId}-${room.roomId}`}
                            className={cn(DASH_NIGHT_CLASS.row, "px-2 py-1.5 text-[11px]")}
                        >
                            <div className="flex items-center justify-between gap-1">
                                <span className="truncate font-bold text-[var(--app-color-text-primary)]">{room.roomName || room.roomId}</span>
                                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black", high ? DASH_NIGHT_CLASS.chipDanger : DASH_NIGHT_CLASS.chipSuccess)}>
                                    延时 {prob.toFixed(0)}%
                                </span>
                            </div>
                            <div className={cn("mt-0.5 flex flex-wrap gap-x-2", DASH_NIGHT_CLASS.textMuted)}>
                                <span>{room.visitCount ?? 0} 次</span>
                                <span>驻留 {formatDuration(room.medianDurationMins ?? 0)}</span>
                                <span className="truncate" title={topNextDest(room.nextRoomProb)}>→ {topNextDest(room.nextRoomProb)}</span>
                            </div>
                        </div>
                    );
                })}
                {hiddenCount > 0 ? (
                    <button
                        type="button"
                        onClick={() => setExpandedRooms((v) => !v)}
                        className={cn(DASH_NIGHT_CLASS.btnNormal, "flex w-full items-center justify-center gap-1 border-dashed py-1 text-[11px] font-bold")}
                    >
                        {expandedRooms ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>}
                        {expandedRooms ? "收起" : `展开 ${hiddenCount} 间`}
                    </button>
                ) : null}
            </div>

            <button
                type="button"
                onClick={() => setChartsOpen((v) => !v)}
                className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600"
            >
                {chartsOpen ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>}
                {chartsOpen ? "收起图表" : "展开出入图表"}
            </button>
            {chartsOpen ? (
                <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                    <CombinedMiniCurve entryCurve={aggEntry} exitCurve={aggExit}/>
                    <WeeklyRibbonChart entryCurve={user.weeklyEntryCurve} exitCurve={user.weeklyExitCurve}/>
                </div>
            ) : null}
        </DebugPersonCardShell>
    );
}
