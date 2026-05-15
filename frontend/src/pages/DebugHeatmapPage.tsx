import {useState, useMemo, useEffect, useRef} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {
    fetchPredictionRoomList,
    fetchGroupHeatmapByRoom,
    triggerGroupHeatmapRecalc,
    fetchRoomCapacity, updateRoomCapacity
} from "@/api/twinApi";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import { AdminToolbar, AdminToolbarActions } from "@/components/admin/AdminToolbar";
import {Map as MapIcon, Clock, Users, Activity} from "lucide-react";
import * as echarts from 'echarts';

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
// 截取 07:00 到 19:00 (共 13 个时间槽)
const HOURS = Array.from({length: 13}, (_, i) => i + 7);

// =========================================================
// 💥 原生 DOM 交通灯矩阵：7x13 方块网格 (上帝视角 + 容量结算)
// 严谨词汇：空闲、低频、适中、拥挤、紧张
// =========================================================
function RoomNativeMatrix({ heatmapData, hours, capacity, isRelative = false }: { heatmapData: any[], hours: number[], capacity: number, isRelative?: boolean }) {
    const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    // 课题组过滤逻辑
    const allGroups = useMemo(() => heatmapData.map(g => g.group_name), [heatmapData]);
    const [activeGroups, setActiveGroups] = useState<string[]>([]);

    // 初始化默认全选
    // 💥 修复 Bug 2：每次切换房间（allGroups 变化时），立刻强制重置雷达开关！
    useEffect(() => {
        setActiveGroups(allGroups);
    }, [allGroups]);

    const toggleGroup = (g: string) => {
        setActiveGroups(p => p.includes(g) ? p.filter(n => n !== g) : [...p, g]);
    };

    // 💥 严谨的颜色与词汇映射字典
    const getHeatColor = (totalPeople: number) => {
        if (totalPeople <= 0.1) return 'bg-slate-50 border-slate-200'; // 空闲 (灰白)

        const safeCap = Math.max(1, Number(capacity) || 1);
        const ratio = totalPeople / safeCap;
        if (ratio < 0.4) return 'bg-emerald-200 border-emerald-300'; // 低频 (浅绿)
        if (ratio < 0.7) return 'bg-amber-300 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]'; // 适中 (黄)
        if (ratio < 0.95) return 'bg-orange-500 border-orange-600 shadow-[0_0_12px_rgba(249,115,22,0.5)]'; // 拥挤 (橙)
        return 'bg-red-600 border-red-700 shadow-[0_0_15px_rgba(220,38,38,0.6)] animate-pulse'; // 紧张 (深红)
    };

    // 💥 拼装极其详细的 Hover 悬浮文本
    const buildTooltipText = (dayIdx: number, hour: number) => {
        // 🤖 注入：物理人头转换算子 (向上占位法)
        const formatHeadcount = (val: number) => {
            if (val <= 0.1) return 0; // 过滤底层噪音
            return Math.ceil(val);    // 只要有概率来，就得给他准备一把椅子！
        };

        let total = 0;
        const details: { name: string, val: number }[] = [];

        heatmapData.forEach(g => {
            if (activeGroups.includes(g.group_name)) {
                const val = g.heatmapMatrix?.[dayIdx]?.[hour] || 0;
                if (val > 0.1) {
                    total += val;
                    details.push({ name: g.group_name, val });
                }
            }
        });

        if (total <= 0.1) return `📅 ${DAYS[dayIdx]} ${hour}:00-${hour+1}:00\n空闲无活动`;

        const safeCap = Math.max(1, Number(capacity) || 1);
        const ratio = total / safeCap;
        let status = '空闲';
        if (ratio >= 0.95) status = '紧张';
        else if (ratio >= 0.7) status = '拥挤';
        else if (ratio >= 0.4) status = '适中';
        else status = '低频';

        details.sort((a, b) => b.val - a.val);

        // 💥 将总人数 total 扔进算子中转换
        const realHeadcount = formatHeadcount(total);

        let text = `📅 ${DAYS[dayIdx]} ${hour}:00-${hour+1}:00\n`;
        // 💥 如果是相对模式 (isRelative=true)，就不显示“限载XX人”这种容易引起误会的文字
        text += `预估: ${realHeadcount}人${isRelative ? '' : ` / 限载${safeCap}人`} [${status}]\n`;
        text += `------------------------\n`;
        text += `【在场课题组分布】\n`;
        details.forEach((d, i) => {
            // 百分比依然使用高精度浮点数计算，保证比例绝对准确！
            const pct = ((d.val / total) * 100).toFixed(0);
            text += `${i + 1}. ${d.name}: 约 ${formatHeadcount(d.val)}人 (${pct}%)\n`;
        });
        return text;
    };

    return (
        <div className="w-full flex flex-col gap-6">
            {/* 💥 顶级交互：可点击的课题组标签栏 */}
            <div className="flex flex-wrap gap-2 px-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-500 mt-1 mr-2">课题组开关:</span>
                {allGroups.map((group, idx) => {
                    const isActive = activeGroups.includes(group);
                    return (
                        <button
                            key={idx}
                            onClick={() => toggleGroup(group)}
                            className={`px-3 py-1 text-xs font-bold rounded-full border transition-all duration-200 
                                ${isActive
                                ? 'bg-white text-emerald-600 border-emerald-300 shadow-sm'
                                : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60 hover:opacity-100'}`}
                        >
                            {group}
                        </button>
                    );
                })}
            </div>

            {/* 💥 你原汁原味的 7x13 交通灯矩阵图 */}
            <div className="p-6">
                <div className="flex text-xs font-bold text-slate-400 mb-2 ml-10 justify-between">
                    {hours.map(h => <span key={h} className="w-6 text-center">{h}h</span>)}
                </div>
                <div className="flex flex-col gap-2">
                    {DAYS.map((day, dayIdx) => (
                        <div key={day} className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-500 w-8">{day}</span>
                            <div className="flex gap-2 flex-1 justify-between">
                                {hours.map((hour) => {
                                    // 计算该格子的真实总人数
                                    let cellTotal = 0;
                                    heatmapData.forEach(g => {
                                        if (activeGroups.includes(g.group_name)) {
                                            cellTotal += (g.heatmapMatrix?.[dayIdx]?.[hour] || 0);
                                        }
                                    });

                                    return (
                                        <div
                                            key={`${day}-${hour}`}
                                            title={buildTooltipText(dayIdx, hour)}
                                            className={`w-6 h-6 rounded-md border ${getHeatColor(cellTotal)} transition-all duration-300 hover:scale-125 cursor-crosshair`}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 底部词汇图例：动态根据当前传入的 capacity 计算真实人数上限 */}
                <div className="mt-8 flex items-center justify-end gap-5 text-[10px] font-bold text-slate-500">
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-slate-50 border border-slate-200"></div>空闲</div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300"></div>低频 {isRelative ? '' : `(<${Math.round(Math.max(1, Number(capacity) || 1) * 0.4)}人)`}</div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-300 border border-amber-400"></div>适中 {isRelative ? '' : `(<${Math.round(Math.max(1, Number(capacity) || 1) * 0.7)}人)`}</div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-500 border border-orange-600"></div>拥挤 {isRelative ? '' : `(<${Math.round(Math.max(1, Number(capacity) || 1) * 0.95)}人)`}</div>
                    <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-600 border border-red-700 animate-pulse"></div>紧张 {isRelative ? '' : `(≥${Math.round(Math.max(1, Number(capacity) || 1) * 0.95)}人)`}</div>
                </div>
            </div>
        </div>
    );
}

export default function DebugHeatmapPage() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [searchDraft, setSearchDraft] = useState("");
    const [currentRoomIndex, setCurrentRoomIndex] = useState(0);

    useEffect(() => {
        setSearchDraft(keyword);
    }, [keyword]);

    // 1. 获取所有有数据的房间列表
    const {data: allRooms = [], isLoading: isLoadingRooms, refetch: refetchRooms} = useQuery({
        queryKey: ["predictionRoomList"],
        queryFn: fetchPredictionRoomList,
    });

    // 2. 本地搜索过滤房间列表
    const filteredRooms = useMemo(() => {
        if (!keyword.trim()) return allRooms;
        return allRooms.filter((r: any) => r.room_name?.toLowerCase().includes(keyword.toLowerCase()));
    }, [allRooms, keyword]);

    // 3. 确定当前选中的房间 ID
    const currentRoom = filteredRooms[currentRoomIndex];
    const currentRoomId = currentRoom?.room_id;

    // 4. 💥 解构后端打包传来的四大金刚 (物理单间 + 虚拟套间)
    const { data: apiResponse, isLoading: isLoadingHeatmap } = useQuery({
        queryKey: ["groupHeatmap", currentRoomId],
        queryFn: () => fetchGroupHeatmapByRoom(currentRoomId!),
        enabled: !!currentRoomId, // 只有拿到 roomId 才发请求
    });

    const roomData = apiResponse?.roomData || [];
    const suiteData = apiResponse?.suiteData || [];
    const suiteId = apiResponse?.suiteId || "";
    const suiteName = apiResponse?.suiteName || "";

    const queryClient = useQueryClient(); // 💥 召唤缓存清理器

    // 💥 容量控制状态：绑定到【套间 suiteId】，而不是单间
    const [localCapacity, setLocalCapacity] = useState<number>(15);
    const physicalRoomName = currentRoom?.room_name as string | undefined;
    const { data: serverCapacity } = useQuery({
        queryKey: ["roomCapacity", suiteId, physicalRoomName],
        queryFn: () => fetchRoomCapacity(suiteId, physicalRoomName),
        enabled: !!suiteId
    });

    // 💥 修复 Bug 1 (A)：只要套间 ID 变了，或者拉到了新容量，立马同步给输入框
    useEffect(() => {
        if (serverCapacity !== undefined && serverCapacity > 0) {
            setLocalCapacity(serverCapacity);
        }
    }, [serverCapacity, suiteId]);

    const saveCapacityMutation = useMutation({
        mutationFn: () => updateRoomCapacity(suiteId, localCapacity, physicalRoomName),
        onSuccess: () => {
            // 💥 修复 Bug 1 (B)：保存成功后，一脚踹碎旧缓存！
            // 这样你切到 201B 时，它会被迫去查最新的容量！
            queryClient.invalidateQueries({ queryKey: ["roomCapacity"] });
        }
    });

    // 💥 绝杀智能算法：找出子房间自身的“历史并发最高人数”，作为单间的相对上限，仅作颜色对比
    const roomRelativeMax = useMemo(() => {
        let max = 1;
        roomData.forEach((g: any) => {
            for(let d=0; d<7; d++) {
                for(let h=7; h<=19; h++) {
                    const v = g.heatmapMatrix?.[d]?.[h] || 0;
                    if (v > max) max = v;
                }
            }
        });
        return Math.ceil(max * 1.5); // 放大一点让颜色分布更均匀
    }, [roomData]);

    const submitRoomSearch = () => {
        setKeyword(searchDraft.trim());
        setCurrentRoomIndex(0);
    };

    const handleRecalc = async () => {
        setIsSyncing(true);
        try {
            await triggerGroupHeatmapRecalc();
            alert("✅ 全局空间推演引擎已启动！请在后台查看进度，稍后刷新页面即可看到最新矩阵。");
            setTimeout(() => {
                refetchRooms();
                setIsSyncing(false);
            }, 2000);
        } catch (error) {
            alert("❌ 引擎启动失败，请检查网络或后端。");
            setIsSyncing(false);
        }
    };

    // 给底下单独的小组卡片用的颜色映射函数
    const getHeatColor = (value: number) => {
        if (value === 0) return 'bg-slate-100/50 border-slate-200/50';
        if (value < 0.3) return 'bg-emerald-200 border-emerald-300';
        if (value < 0.6) return 'bg-amber-300 border-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]';
        if (value < 0.85) return 'bg-orange-500 border-orange-600 shadow-[0_0_12px_rgba(249,115,22,0.5)]';
        return 'bg-red-600 border-red-700 shadow-[0_0_15px_rgba(220,38,38,0.6)] animate-pulse';
    };

    if (isLoadingRooms) return <div className="p-10 text-xl font-bold text-slate-500">正在扫描全校物理空间坐标...</div>;

    return (
        <div className="p-8 bg-slate-50 h-full flex flex-col box-border relative overflow-hidden">
            <AdminToolbar className="mb-6 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
                <div className="min-w-0 max-w-[min(38vw,20rem)] shrink">
                    <h1 className="flex items-center gap-2 truncate text-xl font-black text-slate-800 sm:text-2xl">
                        <MapIcon className="h-7 w-7 shrink-0 text-emerald-600"/> 房间热力调试
                    </h1>
                    <p className="truncate text-xs text-slate-500 sm:text-sm">7×13 时间格：按套间容量与历史聚合展示拥挤度；重算会刷新服务端缓存。</p>
                </div>
                <AdminToolbarActions className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2">
                    <DebugDangerousOpsMenu
                        items={[
                            {
                                key: "recalc-heatmap",
                                label: isSyncing ? "全局测算进行中…" : "重新测算热力（服务端）",
                                minRole: "SUPER_ADMIN",
                                disabled: isSyncing,
                                onSelect: () => {
                                    void handleRecalc();
                                },
                            },
                        ]}
                    />
                    <AdminToolbarSearchField
                        className="w-[min(40vw,12rem)] shrink-0 sm:w-52"
                        placeholder="搜索房间号 (如 208A)..."
                        value={searchDraft}
                        onChange={(val) => {
                            setSearchDraft(val);
                            if (!val.trim()) {
                                setKeyword("");
                                setCurrentRoomIndex(0);
                            }
                        }}
                        onSubmit={submitRoomSearch}
                    />
                    <div className="flex shrink-0 flex-nowrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                        <span className="shrink-0 text-xs font-bold text-slate-600 sm:text-sm">套间限载</span>
                        <input
                            type="number"
                            value={localCapacity}
                            onChange={(e) => setLocalCapacity(Math.max(1, Number(e.target.value) || 1))}
                            className="h-[var(--admin-control-height,2.25rem)] w-14 shrink-0 rounded border border-slate-300 text-center font-bold text-indigo-600 outline-none sm:w-16"
                        />
                        <button
                            type="button"
                            onClick={() => saveCapacityMutation.mutate()}
                            disabled={saveCapacityMutation.isPending || localCapacity === serverCapacity}
                            className="shrink-0 rounded bg-indigo-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                        >
                            保存
                        </button>
                    </div>
                    <div className="flex min-w-0 max-w-[min(52vw,18rem)] shrink-0 flex-nowrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:gap-3 sm:px-4">
                        <button type="button" disabled={currentRoomIndex === 0} onClick={() => setCurrentRoomIndex(p => p - 1)}
                                className="shrink-0 text-lg font-black text-emerald-600 transition-transform hover:opacity-90 disabled:text-slate-300 active:scale-75 sm:text-xl">◀
                        </button>
                        <div className="flex min-w-0 flex-col items-center px-0.5">
                            <span className="truncate text-sm font-black tracking-wider text-slate-800 sm:text-base">{currentRoom?.room_name || '无匹配房间'}</span>
                            <span className="whitespace-nowrap text-[10px] font-bold text-slate-400">第 {filteredRooms.length > 0 ? currentRoomIndex + 1 : 0} / {filteredRooms.length} 间</span>
                        </div>
                        <button type="button" disabled={currentRoomIndex === filteredRooms.length - 1 || filteredRooms.length === 0}
                                onClick={() => setCurrentRoomIndex(p => p + 1)}
                                className="shrink-0 text-lg font-black text-emerald-600 transition-transform hover:opacity-90 disabled:text-slate-300 active:scale-75 sm:text-xl">▶
                        </button>
                    </div>
                </AdminToolbarActions>
            </AdminToolbar>

            {/* 核心视觉区：课题组情报卡片瀑布流 */}
            <div className="flex-1 overflow-y-auto pb-24 pr-2">
                {filteredRooms.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                        <MapIcon className="w-16 h-16 mb-4"/>
                        <span className="text-xl font-bold">未找到符合条件的物理空间</span>
                    </div>
                ) : isLoadingHeatmap ? (
                    <div className="flex items-center justify-center h-full text-emerald-600 font-bold text-lg animate-pulse">
                        读取空间概率张量中...
                    </div>
                ) : (roomData.length === 0 && suiteData.length === 0) ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <span className="text-xl font-bold">该房间暂无任何活动轨迹</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-8">

                        {/* 💥 视图 1：母套间总量控制视图 (看整体容量) */}
                        <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 flex flex-col gap-4 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 pl-3">
                                <Activity className="w-5 h-5 text-indigo-500"/>
                                <h2 className="text-xl font-black text-slate-700 tracking-wide">
                                    {suiteName || '套间总控视图'}
                                </h2>
                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold ml-2">三合一聚合计算 (单间/套间/课题组)</span>
                            </div>
                            <div className="w-full">
                                {/* 绑定的数据是 suiteData，容量是你填写的 localCapacity */}
                                <RoomNativeMatrix heatmapData={suiteData} hours={HOURS} capacity={Math.max(1, localCapacity || 1)} />
                            </div>
                        </div>

                        {/* 💥 视图 2：子房间微观透视视图 (看本房间的课题组) */}
                        <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 flex flex-col gap-4 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-400"></div>
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 pl-3">
                                <MapIcon className="w-5 h-5 text-emerald-500"/>
                                <h2 className="text-xl font-black text-slate-700 tracking-wide">
                                    {currentRoom?.room_name} · 单间内部活跃度矩阵
                                </h2>
                                <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-bold ml-2">相对极限自适应变色</span>
                            </div>
                            <div className="w-full">
                                {/* 绑定的数据是 roomData，容量是智能计算的自身上限 roomRelativeMax */}
                                <RoomNativeMatrix heatmapData={roomData} hours={HOURS} capacity={roomRelativeMax} isRelative={true} />
                            </div>
                        </div>

                        {/* 💥 视图 3：各个课题组分离出的散装小卡片 */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start mt-4">
                            {roomData.map((group: any, idx: number) => (
                                <div key={idx}
                                     className="bg-white rounded-2xl shadow-lg border border-slate-200/60 overflow-hidden hover:shadow-xl transition-shadow">
                                    {/* 卡片头部：课题组身份与高峰 */}
                                    <div
                                        className="bg-gradient-to-r from-emerald-50 to-teal-50/30 px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200">
                                                <Users className="w-5 h-5 text-emerald-600"/>
                                            </div>
                                            <span
                                                className="text-xl font-black text-slate-800">{group.group_name}</span>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="flex flex-col items-end">
                                                <span
                                                    className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">进场高峰</span>
                                                <span
                                                    className="text-sm font-black text-emerald-600 flex items-center gap-1"><Clock
                                                    className="w-3 h-3"/> {group.peak_entry_time}</span>
                                            </div>
                                            <div className="w-[1px] h-8 bg-emerald-200/50"></div>
                                            <div className="flex flex-col items-start">
                                                <span
                                                    className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">离场高峰</span>
                                                <span
                                                    className="text-sm font-black text-orange-500 flex items-center gap-1"><Clock
                                                    className="w-3 h-3"/> {group.peak_exit_time}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 卡片腹部：7x13 交通灯矩阵图 */}
                                    <div className="p-6">
                                        <div
                                            className="flex text-xs font-bold text-slate-400 mb-2 ml-10 justify-between">
                                            {HOURS.map(h => <span key={h} className="w-6 text-center">{h}h</span>)}
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            {DAYS.map((day, dayIdx) => (
                                                <div key={day} className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-slate-500 w-8">{day}</span>
                                                    <div className="flex gap-2 flex-1 justify-between">
                                                        {HOURS.map((hour) => {
                                                            const val = group.heatmapMatrix?.[dayIdx]?.[hour] || 0;

                                                            // 🤖 同样使用向上占位法算子
                                                            const realHeadcount = val <= 0.1 ? 0 : Math.ceil(val);

                                                            return (
                                                                <div
                                                                    key={`${day}-${hour}`}
                                                                    // 💥 修改这里！把带有小数的 val 换成 realHeadcount
                                                                    title={`${day} ${hour}:00 预估: ${realHeadcount} 人`}
                                                                    className={`w-6 h-6 rounded-md border ${getHeatColor(val)} transition-all duration-300 hover:scale-125 cursor-crosshair`}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div
                                            className="mt-5 flex items-center justify-end gap-3 text-[10px] font-bold text-slate-400">
                                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-slate-100 border border-slate-200"></div>空闲</div>
                                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300"></div>低频</div>
                                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-300 border border-amber-400"></div>适中</div>
                                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500 border border-orange-600"></div>拥挤</div>
                                            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-600 border border-red-700"></div>紧张</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}