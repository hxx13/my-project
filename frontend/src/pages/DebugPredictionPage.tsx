import {useState, useMemo, useEffect} from "react";
import {useQuery} from "@tanstack/react-query";
import {fetchDebugPredictionList, fetchPredictionDashboard, fetchPredictionRoomsByUser, triggerModelCalculation} from "@/api/twinApi";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import { AdminToolbar, AdminToolbarActions } from "@/components/admin/AdminToolbar";
import {BrainCircuit} from "lucide-react";

const CombinedMiniCurve = ({entryStr, exitStr}: { entryStr: string, exitStr: string }) => {
    const width = 210;
    const height = 86;
    const padL = 20;
    const padR = 10;
    const padT = 8;
    const padB = 18;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    let entryPointsStr = "";
    let exitPointsStr = "";
    let isValid = false;

    try {
        const entryRaw: unknown = JSON.parse(entryStr);
        const exitRaw: unknown = JSON.parse(exitStr);
        if (!Array.isArray(entryRaw) || !Array.isArray(exitRaw) || entryRaw.length < 24 || exitRaw.length < 24) {
            throw new Error("bad curve");
        }
        const entryData = entryRaw.slice(0, 24).map((v) => Number(v));
        const exitData = exitRaw.slice(0, 24).map((v) => Number(v));
        const startHour = 7;
        const endHour = 19;
        const entrySliced = entryData.slice(startHour, endHour + 1);
        const exitSliced = exitData.slice(startHour, endHour + 1);

        const maxVal = Math.max(...entrySliced, ...exitSliced, 0.01);
        const nPoints = endHour - startHour + 1;
        const xAt = (idx: number) => padL + (plotW * idx) / (nPoints - 1);
        const yAt = (val: number) => padT + plotH - (plotH * val) / maxVal;

        const generatePoints = (data: number[]) => {
            return data.map((val, idx) => {
                const x = xAt(idx);
                const y = yAt(val);
                return `${x},${y}`;
            });
        };

        entryPointsStr = generatePoints(entrySliced).join(' ');
        exitPointsStr = generatePoints(exitSliced).join(' ');
        isValid = true;
    } catch (e) {}

    if (!isValid) return <span className="text-slate-300">无曲线</span>;

    return (
        <div className="twin-debug-prediction-chart-wrap my-1 rounded border border-slate-200 bg-white p-1 shadow-sm">
            <svg width={width} height={height} className="overflow-visible">
                {[0, 3, 6, 9, 12].map((i) => {
                    const x = padL + (plotW * i) / 12;
                    return <line key={`vx-${i}`} x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(0,0,0,0.07)" strokeDasharray="2"/>;
                })}
                {[0.25, 0.5, 0.75].map((r, i) => {
                    const y = padT + plotH * r;
                    return <line key={`hy-${i}`} x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(0,0,0,0.05)"/>;
                })}
                <polygon points={`${padL},${padT + plotH} ${entryPointsStr} ${padL + plotW},${padT + plotH}`} fill="rgba(37, 99, 235, 0.2)"/>
                <polyline points={entryPointsStr} fill="none" stroke="rgba(37, 99, 235, 0.8)" strokeWidth="1.5"/>
                <polygon points={`${padL},${padT + plotH} ${exitPointsStr} ${padL + plotW},${padT + plotH}`} fill="rgba(225, 29, 72, 0.2)"/>
                <polyline points={exitPointsStr} fill="none" stroke="rgba(225, 29, 72, 0.8)" strokeWidth="1.5"/>
                {[7, 10, 13, 16, 19].map((h) => {
                    const idx = h - 7;
                    const x = padL + (plotW * idx) / 12;
                    return (
                        <text key={`tx-${h}`} x={x} y={height - 2} textAnchor="middle" fontSize="9" fill="#64748b">
                            {h}
                        </text>
                    );
                })}
            </svg>
        </div>
    );
};

/** 周一到周日：入场均值线 + 离场均值线 + 带状区域（单位小时 0-24，缺失为 -1）。 */
const WeeklyRibbonChart = ({entryStr, exitStr}: { entryStr: string, exitStr: string }) => {
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

    const parseWeekTimes = (raw: string): number[] | null => {
        try {
            const arr = JSON.parse(raw || "[]");
            if (!Array.isArray(arr) || arr.length !== 7) return null;
            const vals = arr.map((v) => Number(v));
            if (vals.every((v) => !Number.isFinite(v) || v < 0)) return null;
            return vals;
        } catch {
            return null;
        }
    };
    const fillWeekTimes = (src: number[]): number[] => {
        const out = new Array(7).fill(12);
        const has = new Array(7).fill(false);
        let present = 0;
        for (let i = 0; i < 7; i++) {
            const v = src[i];
            if (Number.isFinite(v) && v >= 0) {
                out[i] = Math.max(0, Math.min(24, v));
                has[i] = true;
                present++;
            }
        }
        if (present === 0) return out;
        if (present === 7) return out;
        for (let i = 0; i < 7; i++) {
            if (has[i]) continue;
            let prev = i;
            let dPrev = 0;
            while (dPrev < 7) {
                prev = (prev + 6) % 7;
                dPrev++;
                if (has[prev]) break;
            }
            let next = i;
            let dNext = 0;
            while (dNext < 7) {
                next = (next + 1) % 7;
                dNext++;
                if (has[next]) break;
            }
            if (has[prev] && has[next]) {
                out[i] = (out[prev] * dNext + out[next] * dPrev) / (dPrev + dNext);
            } else if (has[prev]) {
                out[i] = out[prev];
            } else if (has[next]) {
                out[i] = out[next];
            }
        }
        return out;
    };

    const entry = parseWeekTimes(entryStr);
    const exit = parseWeekTimes(exitStr);
    if (!entry || !exit) {
        return (
            <div className="twin-debug-prediction-chart-wrap flex min-h-[60px] items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50/50">
                <span className="text-xs font-bold text-slate-400">暂无周维度数据</span>
            </div>
        );
    }

    const entryFilled = fillWeekTimes(entry);
    const exitFilled = fillWeekTimes(exit);

    const xAt = (i: number) => padL + (i / (days.length - 1)) * plotW;
    const yAt = (hour: number) => {
        const h = Math.max(lowHour, Math.min(highHour, hour));
        return padT + plotH - ((h - lowHour) / span) * plotH;
    };
    const point = (i: number, h: number) => `${xAt(i)},${yAt(h)}`;

    const entryPoints = days.map((_, i) => point(i, entryFilled[i])).join(" ");
    const exitPoints = days.map((_, i) => point(i, exitFilled[i])).join(" ");
    const ribbonPoints = [
        ...days.map((_, i) => point(i, entryFilled[i])),
        ...days.map((_, i) => point(days.length - 1 - i, exitFilled[days.length - 1 - i])),
    ].join(" ");

    return (
        <div className="twin-debug-prediction-chart-wrap relative my-1 rounded border border-slate-200 bg-white p-2 shadow-sm">
            <svg width={width} height={height} className="overflow-visible">
                {Array.from({length: days.length}).map((_, i) => (
                    <line key={i} x1={xAt(i)} y1={padT} x2={xAt(i)} y2={padT + plotH} stroke="rgba(0,0,0,0.06)" strokeDasharray="2"/>
                ))}
                {[0.25, 0.5, 0.75].map((r, i) => {
                    const y = padT + plotH * r;
                    return <line key={`hy-${i}`} x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(0,0,0,0.05)"/>;
                })}
                <polygon points={ribbonPoints} fill="rgba(139, 92, 246, 0.14)"/>
                <polyline points={entryPoints} fill="none" stroke="rgba(37, 99, 235, 0.85)" strokeWidth="1.5"/>
                <polyline points={exitPoints} fill="none" stroke="rgba(225, 29, 72, 0.85)" strokeWidth="1.5" strokeDasharray="2 2"/>
                {days.map((d, i) => (
                    <text key={`dx-${i}`} x={xAt(i)} y={height - 2} textAnchor="middle" fontSize="9" fill="#64748b">
                        {d}
                    </text>
                ))}
                <text x={2} y={padT + 8} fontSize="9" fill="#94a3b8">22h</text>
                <text x={2} y={padT + plotH} fontSize="9" fill="#94a3b8">06h</text>
            </svg>
        </div>
    );
};

export default function DebugPredictionPage() {
    const [page, setPage] = useState(1);
    const pageSize = 40;
    const [keyword, setKeyword] = useState("");
    const [searchDraft, setSearchDraft] = useState("");
    const [isCalculating, setIsCalculating] = useState(false);

    useEffect(() => {
        setSearchDraft(keyword);
    }, [keyword]);

    const {data, isLoading, refetch} = useQuery({
        queryKey: ["debugPredictions", page, pageSize, keyword],
        queryFn: () => fetchDebugPredictionList(page, pageSize, keyword.trim()),
    });

    const totalPages = data?.total ? Math.ceil(data.total / pageSize) : 0;
    const rawData = data?.data || [];

    const pageUsers = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        rawData.forEach((row: any) => {
            const userId = String(row?.user_id ?? "").trim();
            if (!userId || seen.has(userId)) return;
            seen.add(userId);
            out.push(userId);
        });
        return out;
    }, [rawData]);

    const weeklyByUserQuery = useQuery({
        queryKey: ["debugPredictionWeeklyByUserFromDashboard", pageUsers],
        enabled: pageUsers.length > 0,
        queryFn: async () => {
            const parseWeekly7 = (raw: unknown): number[] => {
                try {
                    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
                    if (!Array.isArray(arr) || arr.length !== 7) return new Array(7).fill(-1);
                    return arr.map((v) => {
                        const n = Number(v);
                        return Number.isFinite(n) ? n : -1;
                    });
                } catch {
                    return new Array(7).fill(-1);
                }
            };
            const fillWeekTimes = (src: number[]): number[] => {
                const out = new Array(7).fill(12);
                const has = new Array(7).fill(false);
                let present = 0;
                for (let i = 0; i < 7; i++) {
                    const v = src[i];
                    if (Number.isFinite(v) && v >= 0) {
                        out[i] = Math.max(0, Math.min(24, v));
                        has[i] = true;
                        present++;
                    }
                }
                if (present === 0 || present === 7) return out;
                for (let i = 0; i < 7; i++) {
                    if (has[i]) continue;
                    let prev = i, dPrev = 0;
                    while (dPrev < 7) { prev = (prev + 6) % 7; dPrev++; if (has[prev]) break; }
                    let next = i, dNext = 0;
                    while (dNext < 7) { next = (next + 1) % 7; dNext++; if (has[next]) break; }
                    if (has[prev] && has[next]) out[i] = (out[prev] * dNext + out[next] * dPrev) / (dPrev + dNext);
                    else if (has[prev]) out[i] = out[prev];
                    else if (has[next]) out[i] = out[next];
                }
                return out;
            };

            const acc: Record<string, { eSum: number[]; xSum: number[]; cnt: number[] }> = {};
            await Promise.all(pageUsers.map(async (userId) => {
                let rooms: Array<{ roomId: string; roomName?: string }> = [];
                try {
                    const roomRows = await fetchPredictionRoomsByUser(userId);
                    rooms = roomRows
                        .map((r: any) => ({
                            roomId: String(r?.roomId ?? r?.room_id ?? "").trim(),
                            roomName: String(r?.roomName ?? r?.room_name ?? "").trim(),
                        }))
                        .filter((r) => !!r.roomId);
                } catch {
                    rooms = [];
                }
                if (!rooms.length) return;
                await Promise.all(rooms.map(async ({roomId}) => {
                    try {
                        const d: any = await fetchPredictionDashboard(userId, roomId);
                        const e = parseWeekly7(d?.weeklyEntryCurve ?? d?.weekly_entry_curve_json);
                        const x = parseWeekly7(d?.weeklyExitCurve ?? d?.weekly_exit_curve_json);
                        if (!acc[userId]) acc[userId] = {eSum: new Array(7).fill(0), xSum: new Array(7).fill(0), cnt: new Array(7).fill(0)};
                        for (let i = 0; i < 7; i++) {
                            if (e[i] >= 0 && x[i] >= 0) {
                                acc[userId].eSum[i] += e[i];
                                acc[userId].xSum[i] += x[i];
                                acc[userId].cnt[i] += 1;
                            }
                        }
                    } catch {
                        // 单房间 dashboard 404 忽略，用其余房间继续聚合
                    }
                }));
            }));

            const out: Record<string, { entryJson: string; exitJson: string }> = {};
            Object.entries(acc).forEach(([userId, v]) => {
                const eAvg = v.eSum.map((x, i) => (v.cnt[i] > 0 ? x / v.cnt[i] : -1));
                const xAvg = v.xSum.map((x, i) => (v.cnt[i] > 0 ? x / v.cnt[i] : -1));
                out[userId] = {
                    entryJson: JSON.stringify(fillWeekTimes(eAvg)),
                    exitJson: JSON.stringify(fillWeekTimes(xAvg)),
                };
            });
            return out;
        },
    });

    const submitSearch = () => {
        setPage(1);
        setKeyword(searchDraft.trim());
    };

    const processedData = useMemo(() => {
        if (!rawData || rawData.length === 0) return [];
        const groups: Record<string, any[]> = {};
        rawData.forEach((row: any) => {
            const uid = row.user_id ?? "";
            if (!groups[uid]) groups[uid] = [];
            groups[uid].push(row);
        });

        const userStats = Object.keys(groups).map((userId) => {
            const rows = groups[userId];
            return {
                userId,
                rows,
            };
        });

        const flattened: any[] = [];
        userStats.forEach((stat, groupIndex) => {
            stat.rows.forEach((row, rowIndex) => {
                flattened.push({
                    ...row,
                    isFirstOfGroup: rowIndex === 0,
                    rowSpan: stat.rows.length,
                    isAltGroup: groupIndex % 2 === 0,
                });
            });
        });
        return flattened;
    }, [rawData]);

    const calculateExitTime = (entryTimeRange: string, durationMins: number) => {
        if (!entryTimeRange) return "未知";
        try {
            const entryHour = parseInt(entryTimeRange.split('-')[0].split(':')[0], 10);
            const exitHour = Math.floor(entryHour + (durationMins / 60));
            const exitMin = durationMins % 60;
            return `~${Math.min(23, exitHour).toString().padStart(2, '0')}:${exitMin.toString().padStart(2, '0')}`;
        } catch (e) {
            return "计算错误";
        }
    };

    const handleTriggerCalculation = async () => {
        setIsCalculating(true);
        try {
            await triggerModelCalculation("ALL");
            alert("🚀 后端已启动全量模型推演，请稍后刷新！");
            setTimeout(() => refetch(), 2000);
        } catch (error) {} finally {
            setIsCalculating(false);
        }
    };

    if (isLoading)
        return (
            <div data-twin-debug-prediction className="p-10 text-xl font-bold text-slate-500">
                正在重构全景分析大脑...
            </div>
        );

    return (
        <div data-twin-debug-prediction className="box-border flex h-full flex-col bg-slate-50/50 p-8">

            <AdminToolbar className="mb-6 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
                <div className="min-w-0 max-w-[min(40vw,22rem)] shrink">
                    <h1 className="flex items-center gap-2 truncate text-xl font-black text-slate-800 sm:text-2xl">
                        <BrainCircuit className="h-7 w-7 shrink-0 text-blue-600"/> 驻留预测调试
                    </h1>
                    <p className="truncate text-xs text-slate-500 sm:text-sm">服务端分页；曲线为同日成对会话；周维按完整自然周聚合。</p>
                </div>
                <AdminToolbarActions className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2">
                    <DebugDangerousOpsMenu
                        items={[
                            {
                                key: "pred-calc",
                                label: isCalculating ? "模型计算中…" : "触发模型重算",
                                minRole: "SUPER_ADMIN",
                                disabled: isCalculating,
                                onSelect: () => {
                                    void handleTriggerCalculation();
                                },
                            },
                        ]}
                    />
                    <AdminToolbarSearchField
                        className="w-[min(42vw,14rem)] shrink-0 sm:w-56"
                        placeholder="搜人名、学号或房间…"
                        value={searchDraft}
                        onChange={(val) => {
                            setSearchDraft(val);
                            if (!val.trim()) {
                                setPage(1);
                                setKeyword("");
                            }
                        }}
                        onSubmit={submitSearch}
                    />
                    <div className="flex shrink-0 flex-nowrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm sm:gap-2 sm:px-4">
                        <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="text-lg font-black text-blue-600 disabled:text-slate-300">◀</button>
                        <span className="whitespace-nowrap text-sm font-bold text-slate-700 sm:text-base">第 {page} / {totalPages || 1} 页</span>
                        <button type="button" disabled={page === totalPages || totalPages === 0} onClick={() => setPage((p) => p + 1)} className="text-lg font-black text-blue-600 disabled:text-slate-300">▶</button>
                    </div>
                </AdminToolbarActions>
            </AdminToolbar>

            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-auto relative pb-24">
                <table className="w-max min-w-full text-left text-base whitespace-nowrap border-collapse">

                    <thead className="bg-slate-100 text-slate-700 font-bold border-b-2 border-slate-300 sticky top-0 z-20 shadow-sm text-[15px]">
                    <tr>
                        <th className="p-4 py-5 sticky left-0 top-0 bg-slate-100 z-30 shadow-[1px_0_0_#cbd5e1]">人员合并列</th>
                        <th className="p-4 py-5">房间(上下文)</th>
                        <th className="p-4 py-5">综合驻留时长</th>
                        <th className="p-4 py-5 text-blue-700">预测主入场</th>
                        <th className="p-4 py-5 text-amber-700">预测主离开</th>
                        <th className="p-4 py-5 border-l border-slate-200 text-red-700">综合延时危险系数</th>
                        <th className="p-4 py-5">下一去向轨迹 (真实计算概率降序)</th>
                        <th className="p-4 py-5 border-l border-slate-200">07:00–19:00 出入条件分布</th>
                        <th className="p-4 py-5 border-l border-slate-200 text-purple-700">周作息：入场/离场均值线带状区</th>
                    </tr>
                    </thead>

                    <tbody>
                    {processedData.map((row: any, index: number) => {
                        const prob = (row.overtime_prob || 0) * 100;
                        const isHighRisk = prob > 60;
                        const predictedExit = calculateExitTime(row.peak_entry_time, row.median_duration_mins);

                        let visitCount = 0;
                        try { visitCount = JSON.parse(row.companion_impact_json || "{}").visit_count || 0; } catch (e) {}

                        let nextRoomStr = "";
                        try {
                            const parsed = JSON.parse(row.next_room_prob_json);
                            nextRoomStr = Object.entries(parsed)
                                .sort((a, b) => (b[1] as number) - (a[1] as number))
                                .map(([k, v]) => `${k === 'EXIT' ? '🚪离开大楼' : k}(${((v as number) * 100).toFixed(0)}%)`)
                                .join(' ➔ ');
                        } catch (e) {}

                        const rowBg = row.isAltGroup ? 'bg-white' : 'bg-slate-50/50';

                        return (
                            <tr key={`${row.user_id}-${row.room_id}-${index}`} className={`${rowBg} hover:bg-blue-50/40 transition-colors border-b border-slate-100`}>
                                {row.isFirstOfGroup && (
                                    <td rowSpan={row.rowSpan} className="p-5 align-top font-black text-slate-800 text-lg sticky left-0 z-10 shadow-[1px_0_0_#e2e8f0] bg-white border-b-2 border-slate-200">
                                        <div className="flex flex-col items-center gap-2 mt-3">
                                            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-white text-xl shadow-md">
                                                {(row.user_name || row.user_id || '?').charAt(0)}
                                            </div>
                                            <span className="font-black text-slate-800 mt-1">{row.user_name || '未知用户'}</span>
                                            <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded max-w-[120px] truncate" title={row.user_id}>
                                                {row.user_id}
                                            </span>
                                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 mt-1">
                                                跨 {row.rowSpan} 个房间
                                            </span>
                                        </div>
                                    </td>
                                )}

                                <td className="p-4 font-mono text-sm text-slate-600 border-l border-slate-100/50">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm font-bold text-slate-700">
                                            {row.room_name || row.room_id}
                                        </span>
                                        <span className={`font-bold text-xs px-2 py-1 rounded-full border ${visitCount > 2 ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                                            {visitCount}次
                                        </span>
                                    </div>
                                </td>

                                <td className="p-4 text-slate-700 font-bold text-base">{Math.floor(row.median_duration_mins / 60)}h {row.median_duration_mins % 60}m</td>
                                <td className="p-4 text-blue-700 font-mono font-bold text-base">{row.peak_entry_time}</td>
                                <td className="p-4 text-amber-700 font-mono font-black text-base">{predictedExit}</td>

                                <td className="p-4 border-l border-slate-100/50">
                                    <span className={`font-black text-sm px-3 py-1.5 rounded-lg shadow-sm ${isHighRisk ? 'text-red-700 bg-red-100 border border-red-200' : 'text-emerald-700 bg-emerald-50 border border-emerald-100'}`}>
                                        {prob.toFixed(1)}% {isHighRisk ? '🔥' : '✅'}
                                    </span>
                                </td>

                                <td className="p-4 text-sm text-slate-600 font-bold max-w-[220px] whitespace-normal leading-relaxed">{nextRoomStr || '-'}</td>

                                <td className="px-3 py-2 border-l border-slate-100/50">
                                    <CombinedMiniCurve entryStr={row.entry_curve_json} exitStr={row.exit_curve_json}/>
                                </td>

                                {row.isFirstOfGroup && (
                                    <td rowSpan={row.rowSpan} className="p-3 align-middle border-l border-b-2 border-slate-200 min-w-[232px]">
                                        <WeeklyRibbonChart
                                            entryStr={weeklyByUserQuery.data?.[row.user_id]?.entryJson || row.weekly_entry_curve_json}
                                            exitStr={weeklyByUserQuery.data?.[row.user_id]?.exitJson || row.weekly_exit_curve_json}
                                        />
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}