import { create } from 'zustand';
import type { DashboardStatsResponse } from '@/api/twinApi';

export interface FeedProvenance {
    channel?: string;
    summaryZh?: string;
    detailZh?: string;
    doorName?: string;
    ruleHint?: string;
    /** 原始来源码（与 channel 同义备份，便于展示） */
    feedSource?: string;
}

export interface UniversalEvent {
    eventId: string;
    source: string;
    category: string;
    timestamp: string;
    action: "ENTER" | "EXIT" | "WARN" | "UNKNOWN";
    person: {
        name: string;
        role: string;
        group: string;
        userId?: string;
    };
    location: {
        campus: string;
        floor: string;
        room: string;
        roomId?: string;
    };
    originalData?: {
        rawStatusCode: string;
        message: string;
    };
    feedProvenance?: FeedProvenance;
}

interface EventState {
    realtimeEvents: UniversalEvent[];
    isConnected: boolean;
    pieStats: DashboardStatsResponse | null;

    setConnected: (status: boolean) => void;
    addEvent: (event: UniversalEvent) => void;
    setInitialFeed: (events: UniversalEvent[]) => void;
    /** 与 setInitialFeed 相同，供瀑布流冷启动覆盖列表 */
    setEvents: (events: UniversalEvent[]) => void;
    setPieStats: (stats: DashboardStatsResponse) => void;
}

export const useEventStore = create<EventState>((set) => ({
    realtimeEvents: [],
    isConnected: false,
    pieStats: null,

    setConnected: (status) => set({ isConnected: status }),

    // 💥 修复核心：装甲级防抖与去重！
    addEvent: (event) => set((state) => {
        // 1. 查重雷达：如果这个 eventId 已经存在于列表里，直接抛弃本次推送！
        const isDuplicate = state.realtimeEvents.some(evt => evt.eventId === event.eventId);
        if (isDuplicate) {
            console.warn(`🛡️ [状态机] 拦截到重复的流水推送，已自动过滤: ${event.eventId}`);
            return state; // 保持原状态不变
        }

        // 2. 如果是新的，再放行并保持最多 50 条
        return {
            realtimeEvents: [event, ...state.realtimeEvents].slice(0, 50),
        };
    }),

    setInitialFeed: (events) => set({
        // 💥 顺手给初始数据也加个 Map 去重，防止后端 API 本身返回脏数据
        realtimeEvents: Array.from(new Map(events.map(item => [item.eventId, item])).values()).slice(0, 50)
    }),

    setEvents: (events) => set({
        realtimeEvents: Array.from(new Map(events.map(item => [item.eventId, item])).values()).slice(0, 50)
    }),

    setPieStats: (stats) => set({ pieStats: stats }),
}));