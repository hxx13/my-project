import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CreditCard,
    Users,
    ChevronDown,
    Activity,
    Clock,
    ShieldCheck,
    Map as MapIcon,
    Save,
    Plus,
    Trash2,
    Link as LinkIcon,
    Edit3,
    X,
    MoreVertical
} from 'lucide-react';
import axios from 'axios';
import { AdminToolbar, AdminToolbarActions, AdminToolbarPrimary } from "@/components/admin/AdminToolbar";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import { fetchMyRoomConfigs, createRoomConfig, deleteRoomConfig, updateRoomCapacityBindRoomId } from "@/api/twinApi";
import { useSocket } from '@/hooks/useSocket'; // 🚨 请确认路径是否正确

// ==========================================
// 📡 数据接口定义
// ==========================================
interface Occupant {
    userId: string;
    userName: string;
    entryType: 'OWN_CARD' | 'BORROWED_CARD';
    entryTime: string;
}

interface RoomInventory {
    areaName: string;
    roomName: string;
    roomId?: string | number;
    totalCapacity: number;
    remainingCards: number;
    campusUserCount: number;
    borrowedCardCount: number;
    occupants: Occupant[];
}

const entryTypeConfig = {
    OWN_CARD: { label: '自带校卡', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: ShieldCheck },
    BORROWED_CARD: { label: '公卡领借', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: CreditCard },
};

function splitCapacityBindRoomIds(raw: unknown): string[] {
    if (raw == null || raw === "") return [];
    return String(raw)
        .replace(/，/g, ",")
        .split(/[,;；\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function configMatchesTwinStatus(config: any, status: RoomInventory): boolean {
    const rawName = (status.roomName || "").trim();
    const dictName = (config.roomName || "").trim();
    const sid = status.roomId != null && status.roomId !== "" ? String(status.roomId).trim() : "";
    const binds = splitCapacityBindRoomIds(config.capacityBindRoomId);
    if (sid && binds.includes(sid)) return true;
    if (rawName === dictName) return true;
    if (config.mappingAliases) {
        const aliases = String(config.mappingAliases)
            .replace(/，/g, ",")
            .split(/[,;；\s]+/)
            .map((s: string) => s.trim())
            .filter(Boolean);
        if (aliases.includes(rawName)) return true;
    }
    return false;
}

function mergeTwinInventoryRows(matches: RoomInventory[]): RoomInventory | undefined {
    if (!matches.length) return undefined;
    if (matches.length === 1) return { ...matches[0] };
    const campus = matches.reduce((a, s) => a + (s.campusUserCount || 0), 0);
    const borrowed = matches.reduce((a, s) => a + (s.borrowedCardCount || 0), 0);
    const occ = matches.flatMap((s) => s.occupants || []);
    const first = matches[0];
    return {
        areaName: first.areaName,
        roomName: first.roomName,
        roomId: first.roomId,
        totalCapacity: first.totalCapacity,
        remainingCards: 0,
        campusUserCount: campus,
        borrowedCardCount: borrowed,
        occupants: occ,
    };
}

// ==========================================
// 💥 抽离子组件：单体房间卡片
// ==========================================
function RoomStatusCard({ config, activeStatus, activeTab }: { config: any, activeStatus?: RoomInventory, activeTab: string }) {
    const queryClient = useQueryClient();
    const [isExpanded, setIsExpanded] = useState(false);
    const [localBindRoomId, setLocalBindRoomId] = useState<string>(config.capacityBindRoomId || "");

    useEffect(() => {
        setLocalBindRoomId(config.capacityBindRoomId || "");
    }, [config.capacityBindRoomId]);

    const safeStatus = activeStatus || {
        roomName: config.roomName,
        campusUserCount: 0,
        borrowedCardCount: 0,
        occupants: []
    };

    const [localCapacity, setLocalCapacity] = useState<number>(config.capacity || 15);

    useEffect(() => {
        setLocalCapacity(config.capacity);
    }, [config.capacity]);

    // 🚨 问题 2 修复：绕过旧的 twinApi，直接 Axios 强行打入我们新写的 SQLite 更新接口！
    const saveCapacityMutation = useMutation({
        mutationFn: async () => {
            const res = await axios.put(`/api/v1/twin/config/rooms/${config.id}/capacity?capacity=${localCapacity}`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["myRoomConfigs"] });
            window.alert(`[${config.roomName}] 容量已持久化更新为 ${localCapacity}`);
        }
    });

    const saveBindRoomIdMutation = useMutation({
        mutationFn: () => updateRoomCapacityBindRoomId(config.id, localBindRoomId.trim()),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["myRoomConfigs"] });
            queryClient.invalidateQueries({ queryKey: ["roomOverview"] });
            window.alert(`[${config.roomName}] 流水 room_id 已更新`);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => deleteRoomConfig(config.id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['myRoomConfigs'] });
            window.alert(`[${config.roomName}] 已从雷达矩阵中抹除`);
        }
    });

    const handleDelete = () => {
        if (window.confirm(`⚠️ 危险：确定要销毁 [${config.roomName}] 的监控坐标吗？`)) {
            deleteMutation.mutate();
        }
    };

    const totalOccupants = safeStatus.campusUserCount + safeStatus.borrowedCardCount;
    const remainingCards = Math.max(0, localCapacity - totalOccupants);
    const isFull = remainingCards <= 0;
    const themeColor = activeTab === '浦东' ? 'blue' : 'emerald';

    return (
        <div className={`bg-white rounded-2xl shadow-sm border ${isExpanded ? `border-${themeColor}-300 ring-2 ring-${themeColor}-100` : 'border-slate-200'} flex flex-col transition-all duration-300 group relative hover:z-50`}>
            {/* 卡片头部 */}
            {/* 💥 去掉 overflow-hidden，加上 rounded-t-2xl 完美贴合外层圆角 */}
            <div className={`px-5 py-4 border-b rounded-t-2xl ${activeTab === '浦东' ? 'bg-blue-50/50 border-blue-100' : 'bg-emerald-50/50 border-emerald-100'} flex justify-between items-center relative`}>
                <div className="flex items-center gap-3 z-10 overflow-hidden">
                    <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center border ${activeTab === '浦东' ? 'border-blue-200' : 'border-emerald-200'} shadow-sm shrink-0`}>
                        <Users className={`w-5 h-5 text-${themeColor}-600`} />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <h3 className="text-xl font-black text-slate-800 tracking-wide truncate">{config.roomName}</h3>
                        {config.mappingAliases && (
                            <span className="text-[9px] text-slate-400 font-bold truncate max-w-[120px]" title={config.mappingAliases}>
                                别名: {config.mappingAliases}
                            </span>
                        )}
                        {config.capacityBindRoomId ? (
                            <span
                                className="text-[9px] text-violet-600 font-mono font-bold truncate max-w-[220px]"
                                title={config.capacityBindRoomId}
                            >
                                流水ID: {splitCapacityBindRoomIds(config.capacityBindRoomId).join(" · ")}
                            </span>
                        ) : null}
                    </div>
                </div>

                {/* 💥 融合后的“更多设置”收纳菜单 (纯 CSS 驱动，无需加 State) */}
                <div className="relative group/menu z-20 shrink-0">

                    {/* 1. 触发按钮：平时只显示一个优雅的“三点”图标 */}
                    <button className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 bg-white/50 rounded-md transition-all border border-transparent shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4" />
                    </button>

                    {/* 2. 下拉悬浮面板：绝对定位，悬浮按钮时展开 (使用 scale 和 opacity 做丝滑动画) */}
                    <div className="absolute right-0 top-full mt-1 w-[140px] bg-white rounded-lg shadow-xl border border-slate-200 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-200 origin-top-right scale-95 group-hover/menu:scale-100 flex flex-col p-1.5 gap-1.5">

                        {/* ⚙️ 限载设置区 */}
                        <div className="flex items-center justify-between bg-slate-50 p-1 rounded-md border border-slate-100">
                            <span className="text-[10px] font-bold text-slate-500 px-1 whitespace-nowrap">限载</span>
                            <input
                                type="number"
                                value={localCapacity}
                                onChange={(e) => setLocalCapacity(Number(e.target.value) || 1)}
                                className={`w-10 h-5 text-center text-[11px] font-black text-${themeColor}-600 border-none outline-none bg-transparent`}
                            />
                            <button
                                onClick={() => saveCapacityMutation.mutate()}
                                disabled={saveCapacityMutation.isPending || localCapacity === config.capacity}
                                className={`p-1 rounded text-white shrink-0 ${saveCapacityMutation.isPending ? 'bg-slate-400' : `bg-${themeColor}-600 hover:bg-${themeColor}-700`} disabled:opacity-50 transition-colors`}
                                title="保存容量"
                            >
                                <Save className="w-3 h-3" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-1 bg-violet-50/80 p-1.5 rounded-md border border-violet-100">
                            <span className="text-[9px] font-bold text-violet-700 px-0.5">流水 room_id（可多值共限载）</span>
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    value={localBindRoomId}
                                    onChange={(e) => setLocalBindRoomId(e.target.value)}
                                    placeholder="id1,id2,id3 与流水 room_id 一致"
                                    className="flex-1 min-w-0 h-6 px-1 text-[10px] font-mono border border-violet-200 rounded bg-white"
                                />
                                <button
                                    type="button"
                                    onClick={() => saveBindRoomIdMutation.mutate()}
                                    disabled={saveBindRoomIdMutation.isPending || localBindRoomId.trim() === (config.capacityBindRoomId || "").trim()}
                                    className="p-1 rounded text-white shrink-0 bg-violet-600 hover:bg-violet-700 disabled:opacity-40"
                                    title="保存流水房间ID"
                                >
                                    <Save className="w-3 h-3" />
                                </button>
                            </div>
                        </div>

                        {/* 🗑️ 危险操作区 (红底警示) */}
                        <button
                            onClick={handleDelete}
                            className="flex items-center justify-center gap-1.5 p-1.5 text-[11px] text-rose-500 hover:bg-rose-50 rounded-md transition-colors w-full border border-transparent hover:border-rose-100"
                            title="抹除此房间"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="font-bold">抹除房间</span>
                        </button>

                    </div>
                </div>
            </div>

            {/* 卡片数据区 */}
            <div className="px-2 py-2 grid grid-cols-4 gap-2">
                <div className="flex flex-col items-center justify-center p-2 bg-slate-50 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-400 mb-1">剩余卡</span>
                    <span className={`text-2xl font-black ${isFull ? 'text-rose-500 animate-pulse' : `text-${themeColor}-600`}`}>{remainingCards}</span>
                </div>
                <div className="flex flex-col items-center justify-center p-2 bg-slate-50 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-400 mb-1">自有卡</span>
                    <span className="text-2xl font-black text-slate-700">{safeStatus.campusUserCount}</span>
                </div>
                <div className="flex flex-col items-center justify-center p-2 bg-slate-50 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-400 mb-1">领卡</span>
                    <span className="text-2xl font-black text-slate-700">{safeStatus.borrowedCardCount}</span>
                </div>
            </div>

            {/* 丝滑展开按钮 */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full py-2 bg-slate-50 border-t border-slate-100 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center gap-1 transition-colors"
                disabled={totalOccupants === 0}
            >
                {totalOccupants === 0 ? '当前空间空闲' : (isExpanded ? '收起名册' : `查看在场 ${totalOccupants} 人详情`)}
                {totalOccupants > 0 && <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}><ChevronDown className="w-4 h-4" /></motion.div>}
            </button>

            {/* 抽屉式人员详情 */}
            <AnimatePresence>
                {isExpanded && totalOccupants > 0 && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-white border-t border-slate-100">
                        <div className="p-4 flex flex-col gap-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                            {safeStatus.occupants.map((occ, idx) => {
                                const conf = entryTypeConfig[occ.entryType];
                                const Icon = conf.icon;
                                return (
                                    <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-2.5 hover:border-slate-300 transition-colors">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center font-black text-slate-600 shrink-0 text-sm">
                                                {(occ.userName || '未').charAt(0)}
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className="text-sm font-bold text-slate-800 truncate">{occ.userName}</span>
                                                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1"><Clock className="w-3 h-3"/> {occ.entryTime}</span>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 shrink-0 ${conf.color}`}>
                                            <Icon className="w-3 h-3" /> {conf.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ==========================================
// 💥 页面主入口：一体化大盘
// ==========================================
export default function DebugCardStatusPage() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'浦东' | '浦西'>('浦东');

    // 🚨 问题 3 修复：录入面板的开关状态
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [newRoom, setNewRoom] = useState({ roomName: '', capacity: 15, mappingAliases: '', capacityBindRoomId: '' });

    const { data: myRoomConfigs = [], isLoading: isRoomsLoading } = useQuery({
        queryKey: ["myRoomConfigs"],
        queryFn: fetchMyRoomConfigs,
    });

    // 🌟 1. 唤醒你的 Socket 长连接
    const socket = useSocket();

    // 🌟 2. 移除暴力的 refetchInterval，回归安静的按需加载
    const { data: twinRoomInventory = [], isLoading: isStatusLoading, refetch } = useQuery<RoomInventory[]>({
        queryKey: ['twinRoomInventory'],
        queryFn: async () => {
            const res = await axios.get('/api/v1/twin/cards/status');
            return res.data;
        },
        // 🚨 已删除 refetchInterval: 5000
    });

    // 🌟 3. 缝合 React Query 与 Socket 推送 (核心架构之美)
    useEffect(() => {
        if (!socket) return;

        // 当收到后端推送时的回调函数
        const handleAccessLogUpdate = (payload: any) => {
            console.log("🌊 [WebSocket] 嗅探到物理空间流水更新，触发重绘...", payload);

            // 💥 神级操作：不需要手动处理数据，直接一脚踢翻当前的 query 缓存！
            // React Query 检测到缓存失效后，会自动、无感地向后端发起一次新的 axios 请求。
            queryClient.invalidateQueries({ queryKey: ['twinRoomInventory'] });
            queryClient.invalidateQueries({ queryKey: ['roomOverview'] });
        };

        // 🚨 这里的 'TWIN_GLOBAL_EVENT' 必须替换为你后端 AroSyncTask 里实际 broadcast 的事件名
        socket.on('TWIN_GLOBAL_EVENT', handleAccessLogUpdate);

        // 组件卸载时销毁监听，防止内存泄漏
        return () => {
            socket.off('TWIN_GLOBAL_EVENT', handleAccessLogUpdate);
        };
    }, [socket, queryClient]);

    const addMutation = useMutation({
        mutationFn: () => createRoomConfig({ ...newRoom, campus: activeTab }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['myRoomConfigs'] });
            setNewRoom({ roomName: '', capacity: 15, mappingAliases: '', capacityBindRoomId: '' });
            window.alert('防腐空间坐标录入成功！');
            setShowAddPanel(false); // 录入成功后自动折叠
        },
        onError: (err: any) => {
            window.alert(`添加失败：可能房间名重复。\n${err.message}`);
        }
    });

    const displayedRooms = useMemo(() => {
        const campusConfigs = myRoomConfigs.filter((c: any) => c.campus === activeTab);

        // ==========================================
        // 💥 神级排序：自然字母数字排序引擎
        // 比如：101, 102, 201, E11A, E11B 会被完美智能排序
        // ==========================================
        campusConfigs.sort((a: any, b: any) => {
            return a.roomName.localeCompare(b.roomName, 'zh-CN', { numeric: true });
        });
        return campusConfigs.map((config: any) => {
            const matches = twinRoomInventory.filter((status) => configMatchesTwinStatus(config, status));
            const activeStatus = mergeTwinInventoryRows(matches);
            return { config, activeStatus };
        });
    }, [myRoomConfigs, twinRoomInventory, activeTab]);

    const handleManualSync = async () => {
        if (isSyncing) return;
        setIsSyncing(true);
        try {
            const response = await axios.post('/api/v1/twin/cards/manual-sync');
            if (response.data.success) await refetch();
        } finally {
            setTimeout(() => setIsSyncing(false), 800);
        }
    };

    if (isRoomsLoading)
        return (
            <div
                data-twin-debug-cards
                className="flex h-screen w-full animate-pulse items-center justify-center bg-slate-50 font-bold text-slate-500"
            >
                正在唤醒底层 SQLite 数据总线...
            </div>
        );

    return (
        // 💥 修复后：(接管自身容器的滚动条，并留出底部空间)
        <div
            data-twin-debug-cards
            className="custom-scrollbar box-border h-full min-h-screen overflow-y-auto bg-slate-50 p-8 pb-20 font-sans text-slate-800"
        >

            <AdminToolbar className="mb-6 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
                <AdminToolbarPrimary className="min-w-0 max-w-[min(48vw,24rem)] shrink">
                    <h1 className="flex items-center gap-2 truncate text-2xl font-black text-slate-800">
                        <Activity className="h-7 w-7 shrink-0 text-blue-600" /> 房间调度调试
                    </h1>
                    <p className="truncate text-xs text-slate-500 sm:text-sm">
                        多后室共前室限载时：别名可填多个流水房间名，流水 room_id 支持逗号/中文逗号/分号分隔，人数按合并结果计算。
                    </p>
                </AdminToolbarPrimary>
                <AdminToolbarActions className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2 sm:gap-3">
                    <DebugDangerousOpsMenu
                        items={[
                            {
                                key: "manual-sync-cards",
                                label: isSyncing ? "拉取中…" : "同步流水（卡片状态）",
                                minRole: "SUPER_ADMIN",
                                disabled: isSyncing,
                                onSelect: () => {
                                    void handleManualSync();
                                },
                            },
                        ]}
                    />
                    <button
                        type="button"
                        onClick={() => setShowAddPanel(!showAddPanel)}
                        className={`flex h-[var(--admin-control-height,2.25rem)] shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold shadow-sm transition-all active:scale-95 ${showAddPanel ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
                    >
                        {showAddPanel ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                        {showAddPanel ? '关闭配置' : '空间坐标'}
                    </button>
                    <div className="flex shrink-0 items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                        {(['浦东', '浦西'] as const).map(tab => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className={`rounded-lg px-4 py-2 text-xs font-black transition-all sm:px-6 sm:text-sm ${
                                    activeTab === tab
                                        ? (tab === '浦东' ? 'bg-blue-600 text-white shadow-md' : 'bg-emerald-600 text-white shadow-md')
                                        : 'text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                {tab}校区
                            </button>
                        ))}
                    </div>
                </AdminToolbarActions>
            </AdminToolbar>

            {/* 💥 展开/折叠的建房面板 */}
            <AnimatePresence>
                {showAddPanel && (
                    <motion.div
                        initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                        animate={{ height: 'auto', opacity: 1, marginBottom: 32 }}
                        exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative">
                            <div className={`absolute top-0 left-0 w-1.5 h-full ${activeTab === '浦东' ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                            <span className="text-xs font-black text-slate-400 uppercase tracking-wider pl-2 mr-2">极速新增 {activeTab} 坐标</span>

                            <input
                                type="text"
                                placeholder="标准房间名 (如: 208A)"
                                value={newRoom.roomName}
                                onChange={e => setNewRoom({...newRoom, roomName: e.target.value})}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold outline-none focus:border-indigo-500 bg-slate-50 focus:bg-white w-40"
                            />
                            <input
                                type="number"
                                placeholder="限载"
                                value={newRoom.capacity}
                                onChange={e => setNewRoom({...newRoom, capacity: Number(e.target.value)})}
                                className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold outline-none focus:border-indigo-500 bg-slate-50 focus:bg-white w-20 text-center"
                            />
                            <div className="relative flex-1 min-w-[200px] max-w-md">
                                <LinkIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="流水匹配别名 (逗号分隔)"
                                    value={newRoom.mappingAliases}
                                    onChange={e => setNewRoom({...newRoom, mappingAliases: e.target.value})}
                                    className="pl-9 pr-3 py-2 w-full rounded-lg border border-slate-300 text-sm outline-none focus:border-indigo-500 bg-slate-50 focus:bg-white"
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="流水 room_id（多 id 逗号分隔）"
                                value={newRoom.capacityBindRoomId}
                                onChange={(e) => setNewRoom({ ...newRoom, capacityBindRoomId: e.target.value })}
                                className="px-3 py-2 rounded-lg border border-violet-200 text-sm font-mono outline-none focus:border-violet-500 bg-violet-50/50 focus:bg-white min-w-[12rem] flex-1 max-w-md"
                                title="与 aro_access_log.room_id 一致；多个后室共限载时写多个 id，英文逗号、中文逗号或分号分隔"
                            />
                            <button
                                onClick={() => addMutation.mutate()}
                                disabled={!newRoom.roomName || addMutation.isPending}
                                className={`${activeTab === '浦东' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-5 py-2 rounded-lg text-sm font-black flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm`}
                            >
                                <Plus className="w-4 h-4" /> 写入{activeTab}阵列
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 💥 终极弹性布局：卡片最小 320px，最大 1fr（填满剩余空间），自动换行 */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                {displayedRooms.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-400 opacity-60">
                        <MapIcon className="w-16 h-16 mb-4" />
                        <span className="text-xl font-bold">该校区目前未配置任何空间坐标</span>
                        <span className="text-sm mt-2">请点击右上角【配置空间坐标】录入</span>
                    </div>
                    // 💥 修改这里：为解构出的变量显式指定类型
                ) : displayedRooms.map(({ config, activeStatus }: { config: any; activeStatus: any }) => (
                    <RoomStatusCard
                        key={config.id}
                        config={config}
                        activeStatus={activeStatus}
                        activeTab={activeTab}
                    />
                ))}
            </div>
        </div>
    );
}