import React from 'react';
import AutoGenerateBadge from './AutoGenerateBadge';
// 💥 1. 扩展接口定义
export interface RoomPrediction {
    roomId: string;
    roomName: string;
    focusTime: string;
    entryTime: string;
    exitTime: string;
    isHighRisk: boolean;
    isPlaceholder?: boolean; // 新增属性
    nextTrajectory?: { [key: string]: number };
    // 💥 补上这两个数组定义，告诉 TS 我们传了真实的 24H 数据进来了！
    entryCurve?: number[];
    exitCurve?: number[];
    weeklyEntryCurve?: number[];
    weeklyExitCurve?: number[];
}

interface AIPredictionCardProps {
    predictions?: RoomPrediction[];
    isLoading?: boolean;
    themeColor?: string;
}

const AIPredictionCard: React.FC<AIPredictionCardProps> = ({
                                                               predictions = [],
                                                               themeColor = "#2d5cf7"
                                                           }) => {
    const isPink = themeColor === '#fbb9b6';

    // 💥 视觉重构 3：升级翻译器，将名字和概率在数据结构上彻底分离，方便独立上色！
    const parseTrajectory = (trajectoryData?: any) => {
        if (!trajectoryData) return [];
        try {
            const parsed = typeof trajectoryData === 'string' ? JSON.parse(trajectoryData) : trajectoryData;
            if (Object.keys(parsed).length === 0) return [];

            return Object.entries(parsed)
                .sort((a, b) => (b[1] as number) - (a[1] as number)) // 真实降序
                .map(([key, value]) => {
                    const name = key === 'EXIT' ? '🚪离开大楼' : key;
                    const prob = Math.round((value as number) * 100);
                    // 注意：这里返回的是对象，不再是拼接好的死字符串！
                    return { name, prob: `${prob}%` };
                });
        } catch (e) {
            return [];
        }
    };

    const glowColor = isPink ? 'bg-rose-500/10 group-hover:bg-pink-500/20' : 'bg-blue-500/10 group-hover:bg-indigo-500/20';
    const iconColor = isPink ? 'text-rose-400' : 'text-blue-400';
    const iconBg = isPink ? 'bg-rose-500/10 border-rose-500/20' : 'bg-blue-500/10 border-blue-500/20';
// ==========================================
    // 💥 绝杀引擎：24H出入场概率双轨聚合计算 (真实数据驱动)
    // ==========================================
    const generate24HTrackData = () => {
        const dayStart = 7;
        const dayEnd = 19;
        const seg = dayEnd - dayStart + 1;
        const width = 300;
        const height = 45;

        let entrySeg = new Array(seg).fill(0);
        let exitSeg = new Array(seg).fill(0);
        let validCount = 0;

        if (predictions && predictions.length > 0) {
            predictions.forEach((p) => {
                const ec = (p as RoomPrediction & { entryCurve?: number[] }).entryCurve;
                const xc = (p as RoomPrediction & { exitCurve?: number[] }).exitCurve;
                if (ec?.length === 24 && xc?.length === 24) {
                    validCount++;
                    for (let i = 0; i < seg; i++) {
                        const h = dayStart + i;
                        entrySeg[i] += ec[h] ?? 0;
                        exitSeg[i] += xc[h] ?? 0;
                    }
                }
            });
            if (validCount > 0) {
                entrySeg = entrySeg.map((v) => v / validCount);
                exitSeg = exitSeg.map((v) => v / validCount);
            }
        }

        const maxVal = Math.max(...entrySeg, ...exitSeg, 0.01);
        const getX = (idx: number) => (seg <= 1 ? 0 : (idx / (seg - 1)) * width);
        const getY = (val: number) => Math.max(2, height - 2 - ((val / maxVal) * (height - 4)));

        const entryPoints = entrySeg.map((v, i) => `${getX(i)},${getY(v)}`).join(" ");
        const exitPoints = exitSeg.map((v, i) => `${getX(i)},${getY(v)}`).join(" ");

        const entryAreaPoints = `0,${height} ${entryPoints} ${width},${height}`;
        const exitAreaPoints = `0,${height} ${exitPoints} ${width},${height}`;

        return { entryPoints, exitPoints, entryAreaPoints, exitAreaPoints };
    };
    // 💥 修复 1：就是漏了这一句！必须执行函数拿到数据，下面的 SVG 才能画出来！
    const trackData = generate24HTrackData();
    return (
        <div
            className="group relative w-full overflow-hidden rounded-2xl bg-[#0a0f1d] p-5 font-sans shadow-2xl border border-white/5">
            <AutoGenerateBadge />
            <div
                className={`absolute -top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl transition-all duration-700 ${glowColor}`}/>

            <div className="relative flex flex-col gap-3">
                {/* 💥 1. 缩小后的 Header */}
                <div className="flex items-start justify-between border-b border-white/5 pb-2">
                    <div className="flex items-center gap-2.5">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${iconBg}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
                                 className={`w-4 h-4 ${iconColor}`}>
                                <path fillRule="evenodd"
                                      d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.522 2.522l2.846.813a.75.75 0 010 1.438l-2.846.813a3.75 3.75 0 00-2.522 2.522l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.522-2.522l-2.846-.813a.75.75 0 010-1.438l2.846-.813a3.75 3.75 0 002.522-2.522l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z"
                                      clipRule="evenodd"/>
                            </svg>
                        </div>
                        <div>
                            {/* 💥 视觉重构 1：模块大标题采用主题渐变色，文字修改为 AI行为预测 */}
                            <p className={`text-base font-black bg-gradient-to-r ${isPink ? 'from-rose-400 to-orange-300' : 'from-blue-400 to-cyan-300'} bg-clip-text text-transparent leading-none drop-shadow-sm tracking-widest`}>
                                AI行为预测
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1.5 leading-none font-medium">
                                基于历史数据大模型测算
                            </p>
                        </div>
                    </div>
                </div>

                {/* 💥 终极 4 列排版：包含全景东方明珠、极度压缩纵向体积、智能折行 */}
                {predictions.map((pred) => {
                    const opacityClass = pred.isPlaceholder ? 'opacity-40 grayscale' : 'opacity-100';

                    // 智能拆解拼接房间名
                    const nameParts = pred.roomName.split(' - ');
                    const prefix = nameParts.length > 1 ? nameParts[0].trim() : '';
                    const suffix = nameParts.length > 1 ? nameParts.slice(1).join(' - ').trim() : pred.roomName;

                    return (
                        <div key={pred.roomId}
                             className={`flex items-center justify-between rounded-xl bg-white/[0.03] py-1.5 px-2 border border-white/5 transition-opacity duration-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] ${opacityClass}`}>

                            {/* 💥 列 1: 东方明珠 & 双行房间名 (flex-[1.2]) */}
                            <div
                                className="flex-[1.2] min-w-0 pr-2 border-r border-slate-700/50 flex items-center gap-1.5">
                                {/* 💥 手术刀：更换为最经典、最具辨识度的极简赛博老鼠图标 */}
                                <div
                                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${iconBg} shadow-md`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                         strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                                         className={`w-4 h-4 ${iconColor}`}
                                         style={{'filter': `drop-shadow(0 0 2px currentColor)`} as any}>

                                        {/* 1. 电子尾巴：流畅的S型数据线 */}
                                        <path d="M4 14c-4 0-4 6 1 6h2" />

                                        {/* 2. 机械躯干：圆润后背 + 几何切割的尖吻头部 */}
                                        <path d="M6 16h9l4-2l-2-3h-3l-2-2H8a4 4 0 0 0-4 4v3z" />

                                        {/* 3. 雷达接收器（圆耳朵） */}
                                        <circle cx="13" cy="9" r="2" />

                                        {/* 4. 光学传感器（发光眼睛） */}
                                        <circle cx="16.5" cy="12.5" r="0.5" fill="currentColor" stroke="none" />

                                        {/* 5. 探雷天线（机械胡须） */}
                                        <path d="M19 13.5l3-1.5" />
                                        <path d="M19 14.5l3 1.5" />

                                    </svg>
                                </div>
                                {/* 🗼 赛博纯手工重绘版：东方明珠 (带斜撑和三球体) */}
                                {/*<div*/}
                                {/*    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${iconBg} shadow-md`}>*/}
                                {/*    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"*/}
                                {/*         className={`w-4 h-4 ${iconColor}`}*/}
                                {/*         style={{'filter': 'drop-shadow(0 0 2px currentColor)'} as any}>*/}
                                {/*        /!* 塔基斜撑 *!/*/}
                                {/*        <path d="M7 22L10.5 16.5" stroke="currentColor" strokeWidth="1.5"*/}
                                {/*              strokeLinecap="round"/>*/}
                                {/*        <path d="M17 22L13.5 16.5" stroke="currentColor" strokeWidth="1.5"*/}
                                {/*              strokeLinecap="round"/>*/}
                                {/*        /!* 核心主轴 *!/*/}
                                {/*        <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5"*/}
                                {/*              strokeLinecap="round"/>*/}
                                {/*        /!* 下球体 (大) *!/*/}
                                {/*        <circle cx="12" cy="14.5" r="3" fill="currentColor"/>*/}
                                {/*        /!* 上球体 (中) *!/*/}
                                {/*        <circle cx="12" cy="8.5" r="2.2" fill="currentColor"/>*/}
                                {/*        /!* 塔尖太空舱 (小) *!/*/}
                                {/*        <circle cx="12" cy="4.5" r="1" fill="currentColor"/>*/}
                                {/*    </svg>*/}
                                {/*</div>*/}
                                <div className="flex flex-col min-w-0 w-full pt-1 pb-0.5">
                                    {prefix && (
                                        <span
                                            className="text-[9px] font-medium text-slate-400 truncate w-full leading-tight"
                                            title={prefix}>
                                            {prefix}
                                        </span>
                                    )}
                                    <span
                                        className="text-[12px] font-extrabold text-slate-100 truncate w-full tracking-wide mt-0.5 leading-tight"
                                        title={suffix}
                                        style={{'filter': 'drop-shadow(0 0 1px rgba(255,255,255,0.4))'} as any}>
                                        {suffix}
                                    </span>
                                </div>
                            </div>

                            {/* 💥 视觉重构 2：核心驻留时长，采用高饱和度琥珀色 + 强发光，瞬间抓住眼球 */}
                            <div className="flex-[0.7] flex flex-col items-center justify-center px-1.5 border-r border-slate-700/50">
                                <p className="text-[16px] font-black text-[#ffb86c] leading-none drop-shadow-[0_0_8px_rgba(255,184,108,0.5)] tracking-tight">
                                    {pred.focusTime}
                                </p>
                                <p className="mt-1.5 text-[7px] font-medium text-slate-400 leading-none whitespace-nowrap">
                                    入场 <span className={pred.isPlaceholder ? 'text-slate-500' : iconColor}>{pred.entryTime}</span>
                                </p>
                            </div>

                            {/* 💥 列 3: 离场预警 (flex-[0.7]) */}
                            <div
                                className="flex-[0.7] flex flex-col items-center justify-center px-1.5 border-r border-slate-700/50">
                                <p className="text-[14px] font-black text-slate-100 leading-none drop-shadow-lg tracking-tight">{pred.exitTime}</p>
                                {pred.isPlaceholder ? (
                                    <p className="mt-1.5 text-[7px] font-medium text-slate-500 leading-none">积累中</p>
                                ) : pred.isHighRisk ? (
                                    <p className="mt-1.5 text-[7px] font-bold text-red-400 flex items-center gap-1 leading-none">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> 预警
                                    </p>
                                ) : (
                                    <p className="mt-1.5 text-[7px] font-bold text-emerald-400 leading-none">平稳</p>
                                )}
                            </div>

                            {/* 💥 视觉重构 4：去向列表，分离房间名(弱色)和概率(强主题色) */}
                            <div className="flex-[1.5] flex flex-col items-center justify-center px-2 border-l border-slate-700/50 min-w-0">
                                {pred.isPlaceholder ? (
                                    <p className="text-[10px] font-bold text-slate-500 leading-tight text-center w-full">
                                        等待推演...
                                    </p>
                                ) : (
                                    <div className="flex flex-col gap-0.5 items-start justify-center w-fit max-w-full">
                                        {parseTrajectory(pred.nextTrajectory).map((item, i) => (
                                            <p key={i} className="text-[10px] font-bold leading-tight truncate max-w-full" title={`${item.name}(${item.prob})`}>
                                                <span className="text-slate-400">➔ {item.name}</span>
                                                {/* 排名第一的概率赋予高亮主题色，其他的置灰 */}
                                                <span className={`ml-0.5 ${i === 0 ? iconColor : 'text-slate-500'} font-black drop-shadow-sm`}>
                                                    ({item.prob})
                                                </span>
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* 💥 底部图表重构：基于真实大数据的 24H 聚合双轨概率图 */}
                <div className="relative h-[75px] w-full mt-2 border-t border-white/5 pt-2 shrink-0 flex flex-col">

                    {/* 图例区：明确告知使用者两条线的含义 */}
                    <div className="flex justify-between items-end px-1 mb-1.5 z-10">
                        <span className="text-[9px] font-bold text-slate-400 tracking-wider">07:00–19:00 出入条件分布（多房间均值）</span>
                        <div className="flex gap-2">
                            <span className="text-[8px] flex items-center gap-1 text-slate-400"><span className={`w-1.5 h-1.5 rounded-full ${isPink ? 'bg-rose-400' : 'bg-blue-400'}`}></span> 入场</span>
                            <span className="text-[8px] flex items-center gap-1 text-slate-500"><span className={`w-1.5 h-1.5 rounded-full border border-dashed ${isPink ? 'border-rose-400' : 'border-blue-400'}`}></span> 离场</span>
                        </div>
                    </div>

                    {/* SVG 渲染区：彻底免疫字体变形问题 */}
                    <div className="relative flex-1 w-full">
                        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 300 45" preserveAspectRatio="none">
                            <defs>
                                <linearGradient id={isPink ? "area-pink" : "area-blue"} x1={0} y1={0} x2={0} y2={1}>
                                    <stop offset="0%" stopColor={isPink ? "#f43f5e" : "#3b82f6"} stopOpacity="0.25" />
                                    <stop offset="100%" stopColor={isPink ? "#e11d48" : "#8b5cf6"} stopOpacity="0.02" />
                                </linearGradient>
                            </defs>

                            {/* 纵向对齐虚线网格 (0点, 6点, 12点, 18点, 24点) */}
                            {[0, 75, 150, 225, 300].map((x) => (
                                <line key={x} x1={x} y1="0" x2={x} y2="45" stroke="rgba(255,255,255,0.05)" strokeDasharray="2" />
                            ))}

                            {/* 💥 精准修复：用两座触底的山峰面积叠加，替代原本悬浮的飘带 */}
                            <polygon points={trackData.entryAreaPoints} fill={`url(#${isPink ? 'area-pink' : 'area-blue'})`} opacity="0.8" />
                            <polygon points={trackData.exitAreaPoints} fill={`url(#${isPink ? 'area-pink' : 'area-blue'})`} opacity="0.4" />

                            {/* 入场概率实线 */}
                            <polyline points={trackData.entryPoints} fill="none" stroke={isPink ? '#fb7185' : '#60a5fa'} strokeWidth="1.5" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' } as any} />
                            {/* 离场概率虚线 */}
                            <polyline points={trackData.exitPoints} fill="none" stroke={isPink ? '#fb7185' : '#60a5fa'} strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
                        </svg>
                    </div>

                    {/* 底部时间刻度标尺 (使用绝对原生的 HTML，绝对不会被拉伸) */}
                    <div className="flex justify-between w-full mt-1 px-1">
                        <span className="text-[8px] font-bold text-slate-600">07:00</span>
                        <span className="text-[8px] font-bold text-slate-600">11:00</span>
                        <span className="text-[8px] font-bold text-slate-600">15:00</span>
                        <span className="text-[8px] font-bold text-slate-600">19:00</span>
                    </div>
                </div>

                <div className="border-t border-white/5 pt-3 flex gap-3">
                    <button
                        className="flex-1 rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs font-bold text-slate-400 transition-colors duration-300 hover:bg-slate-800 hover:text-white">轨迹画像
                    </button>
                    <button
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors duration-300 ${isPink ? 'border-rose-500/50 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white' : 'border-blue-500/50 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white'}`}>日程干预
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AIPredictionCard;