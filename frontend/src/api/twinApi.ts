import axios from 'axios';
import { authHttp } from '@/api/core/authHttp';

const api = axios.create({ baseURL: '/api/v1/twin/dashboard' });

const asArrayData = (payload: any): any[] => {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.data)) return payload.data;
    return [];
};

const asMapData = (payload: any): Record<string, any> => {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
            return payload.data;
        }
        return payload;
    }
    return {};
};

const asData = <T>(payload: any, fallback: T): T => {
    if (payload && typeof payload === 'object' && 'data' in payload) {
        return (payload.data ?? fallback) as T;
    }
    return (payload ?? fallback) as T;
};

// 严格定义后端吐出的数据类型
export interface RoomStats {
    name: string;
    value: number;
}

export interface LineStats {
    times: string[];
    pudong: number[];
    puxi: number[];
}

export interface DashboardStatsResponse {
    pudongPie: RoomStats[];
    puxiPie: RoomStats[];
    lineChart: LineStats;
}

// 💥 真正的网络请求！前端只负责伸手要，再也不自己造假数据了！
export const fetchDashboardStats = async (): Promise<DashboardStatsResponse> => {
    // Vite proxy 会自动把 /api/v1... 转发给跑在 8080 端口的 Spring Boot
    const response = await axios.get('/api/v1/twin/dashboard/stats');
    return asMapData(response.data?.data || response.data) as DashboardStatsResponse;
};

// --- Debug 专属类型 ---
export interface DebugRecord {
    id: string;
    user_id?: string;
    accessType: number;
    create_time: string;
    name: string;
    user_type_names: string;
    project_group_names: string;
    area_name: string;
    room_name: string;
    // 💥 新增的底层状态字段
    is_borrowed_card?: number;
    is_own_card?: number;
    is_shared_card?: number;
    is_keep_card?: number;
    has_physical_card_mapping?: number;
    freeze_exempt_flag?: number;
}

// 请求 Debug 接口
export const fetchDebugLogs = async (): Promise<DebugRecord[]> => {
    const response = await axios.get('/api/v1/twin/dashboard/debug/logs');
    return asArrayData(response.data?.data);
};

// --- 💥 新增：流水档案库分页请求类型 ---
export interface DebugLogPageResponse {
    data: DebugRecord[];
    total: number;
}

// 💥 新增：请求分页的流水数据 (替换掉原来那个一次性拉取全部的老方法)
export const fetchDebugLogList = async (page: number, size: number = 100): Promise<DebugLogPageResponse> => {
    const response = await axios.get(`/api/v1/twin/dashboard/debug/logs/list?page=${page}&size=${size}`);
    return response.data?.data || { data: [], total: 0 };
};

// --- 人员档案类型 ---
export interface PersonnelRecord {
    user_id: string;
    name: string;
    head: string;
    gender: number;
    mobile_phone: string;
    department_name: string;
    project_group_name: string;
    user_type_names: string;
}

export interface PersonnelPageResponse {
    data: PersonnelRecord[];
    total: number;
}

// 请求分页数据
export const fetchDebugPersonnelList = async (page: number, size: number = 100): Promise<PersonnelPageResponse> => {
    const response = await axios.get(`/api/v1/twin/dashboard/debug/personnel/list?page=${page}&size=${size}`);
    return response.data?.data || { data: [], total: 0 };
};

// --- 扫码引擎接口类型定义 ---
export interface RoomInfo {
    id: string;
    name: string;
    areaName: string;
    floorName: string;
}

export interface AnalyzeResponse {
    message: string;
    success: boolean;
    userInfo: { userId: string; name: string; head: string; group: string; };
    currentState: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';
    pendingRooms?: RoomInfo[];
    allowedRooms?: RoomInfo[];

    // =========================================================
    // 💥 新增：告诉 TypeScript，后端现在会传这两个风控字段过来了！
    // =========================================================
    globalUserState?: number;
    disciplinaryRecords?: DisciplinaryRecord[];
}

export interface ExecutePayload {
    userId: string;
    roomId: string;
    action: 'ENTER' | 'EXIT';
}

// 💥 1. 发起扫码身份解析
export const analyzeScan = async (userId: string): Promise<AnalyzeResponse> => {
    const response = await axios.get(`/api/v1/twin/scan/analyze?userId=${userId}`);
    return asData<AnalyzeResponse>(response.data, {} as AnalyzeResponse);
};

export const executeAccess = async (payload: ExecutePayload) => {
    const response = await axios.post('/api/v1/twin/scan/execute', payload);
    // 💥 兼容市面最常规的 code 200 判断逻辑，以及 success 字段双重保险
    if (response.data.code !== 200 && response.data.success !== true) {
        throw new Error(response.data.msg || response.data.message || '官方接口拒绝操作');
    }
    return response.data;
};

// 🏆 API 1：课题组排行榜数据接口
export const fetchGroupRanking = async (timeType: 'TODAY' | 'MONTH', region: 'TOTAL' | 'PUDONG' | 'PUXI') => {
    const res = await api.get(`/ranking`, { params: { timeType, region } });
    return asArrayData(res.data?.data);
};

// 📊 API 2：今日饼图 & 区域总进出人次接口
export const fetchPieChartData = async () => {
    const res = await api.get(`/pie-chart`);
    return asMapData(res.data?.data);
};

// 📈 API 3：供给给高峰曲线图使用 (暂留，待中间区域定稿后使用)
export const fetchLineChartData = async () => {
    const res = await api.get(`/line-chart`);
    return asMapData(res.data?.data);
};

// 💥 增加：大屏左侧实时流水列表（冷启动获取最新 N 条真实数据）
export const fetchRealtimeFeed = async (limit: number = 50) => {
    const response = await axios.get(`/api/v1/twin/dashboard/realtime-feed?limit=${limit}`);
    return asArrayData(response.data?.data);
};

/** 进出流水弹窗：按用户与刷卡时间拉取附近自动化审计（与列表项相同字段，含 detailDisplayZh） */
export const fetchAutomationLogsNear = async (params: {
    userId: string;
    anchorTime: string;
    windowMinutes?: number;
    limit?: number;
    /** 默认 true：隐藏 ARO 穿甲轮询定时任务噪声 */
    excludePenetrationPoll?: boolean;
}): Promise<AutomationLogRow[]> => {
    const sp = new URLSearchParams();
    sp.set('userId', params.userId);
    sp.set('anchorTime', params.anchorTime);
    if (params.windowMinutes != null) sp.set('windowMinutes', String(params.windowMinutes));
    if (params.limit != null) sp.set('limit', String(params.limit));
    if (params.excludePenetrationPoll === false) {
        sp.set('excludePenetrationPoll', 'false');
    }
    const response = await axios.get(`/api/v1/twin/dashboard/automation-logs-near?${sp.toString()}`);
    const d = response.data?.data;
    return Array.isArray(d) ? d : [];
};

export interface DashboardStatsResponse {
    pudongPie: RoomStats[];
    puxiPie: RoomStats[];
    // 💥 补齐缺失的字段，彻底消灭红线报错！
    pudongTotal: number;
    puxiTotal: number;
}

// 💥 增加 limit 参数，默认深水炸弹级别 (500条)
export const searchRealtimeFeed = async (keyword: string, limit: number = 9999) => {
    const response = await axios.get(`/api/v1/twin/dashboard/realtime-feed/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`);
    return asArrayData(response.data?.data);
};

// 💥 增加：人员档案库专属搜索 API
export const searchPersonnel = async (keyword: string) => {
    const response = await axios.get(`/api/v1/twin/dashboard/personnel/search?keyword=${encodeURIComponent(keyword)}`);
    return asArrayData(response.data?.data);
};

// 💥 触发全量经验值重算
export const recalculateRpgExp = async () => {
    const response = await axios.get('/api/v1/twin/rpg/recalculate-all');
    return response.data;
};

// 💥 触发全量人员资料库同步 (假设你的接口叫这个)
export const syncPersonnelData = async (signal?: AbortSignal) => {
    const response = await axios.post('/api/v1/twin/personnel/sync-all', undefined, { signal }); // 替换为你的真实后端路径
    return response.data;
};

// 💥 触发进出流水全量同步拉取 (假设你的接口叫这个)
export const syncAccessLogs = async () => {
    const response = await axios.post('/api/v1/twin/dashboard/sync-logs'); // 替换为你的真实后端路径
    return response.data;
};

// =========================================================
// 🧠 AI 空间驻留推演大脑 API (Twin Prediction Engine)
// =========================================================

export interface PredictionPageResponse {
    data: Array<Record<string, unknown>>;
    total: number;
}

export interface PredictionRoomItem {
    room_id?: string;
    room_name?: string;
    roomId?: string;
    roomName?: string;
}

export const fetchDebugPredictionList = async (page: number, size: number = 100, keyword: string = ''): Promise<PredictionPageResponse> => {
    const response = await axios.get(`/api/v1/twin/prediction/admin/list?page=${page}&size=${size}&keyword=${encodeURIComponent(keyword)}`);
    return asData<PredictionPageResponse>(response.data, { data: [], total: 0 });
};

// 💥 2. 触发后端全量/单点炼丹重算 (Trigger)
export const triggerModelCalculation = async (userId: string = 'ALL') => {
    // 之前我们在后端已经把这个接口改成了 GET 请求
    const response = await axios.get(`/api/v1/twin/prediction/admin/trigger?userId=${encodeURIComponent(userId)}`);
    return response.data;
};

// 💥 3. 大屏端直接读取某人的专属推演结果 (供你的卡片 UI 使用)
export const fetchPredictionDashboard = async (userId: string, roomId: string) => {
    const response = await axios.get(`/api/v1/twin/prediction/dashboard?userId=${encodeURIComponent(userId)}&roomId=${encodeURIComponent(roomId)}`);
    return asMapData(response.data?.data);
};

export const fetchPredictionRoomsByUser = async (userId: string): Promise<PredictionRoomItem[]> => {
    const response = await axios.get(`/api/v1/twin/prediction/rooms?userId=${encodeURIComponent(userId)}`);
    return asArrayData(response.data?.data);
};

// =========================================================
// 🐭 实验动物订单模块 API
// =========================================================

// 🏆 课题组动物订购月度排行榜
export const fetchAnimalOrderRanking = async (region: 'TOTAL' | 'PUDONG' | 'PUXI') => {
    const response = await axios.get(`/api/v1/twin/order/ranking?region=${region}`);
    return asArrayData(response.data?.data);
};

// 🛠️ Debug专属：获取单课题组的全量透视数据 (一页一组 Master-Detail 模式)
// 💥 完美接入 SEARCH 搜索功能！
export const fetchGroupOrderDetailData = async (page: number, keyword: string = '') => {
    // 💥 接口地址改为 Controller 里写好的聚合路径
    const response = await axios.get(`/api/v1/twin/order/admin/grouped-all?page=${page}&keyword=${encodeURIComponent(keyword)}`);
    return asData(response.data, { data: [], total: 0 });
};

// ⚡ Debug专属：手动触发同步官方数据（可传 AbortSignal）
export const syncAnimalOrders = async (signal?: AbortSignal) => {
    const response = await axios.get('/api/v1/twin/order/admin/sync', { signal });
    return response.data;
};

// ⏸️ Debug专属：暂停正在进行的订单同步
export const cancelAnimalOrderSync = async () => {
    const response = await axios.post('/api/v1/twin/order/admin/sync/cancel');
    return response.data;
};

// 💥 增加 areaName 参数
export const fetchRetentionWarnings = async (limit: number, areaName: string) => {
    try {
        const res = await axios.get('/api/v1/twin/dashboard/retention-warnings', {
            params: { limit, areaName }
        });
        return asArrayData(res.data?.data);
    } catch (error) {
        console.error("雷达数据拉取异常:", error);
        return [];
    }
};

// =========================================================
// 🚨 风控引擎与状态接管 API
// =========================================================

export interface DisciplinaryRecord {
    id: string;
    createTime: string;
    operateName: string;
    record: string;
}

export interface UserStatusResponse {
    state: number; // 2 代表正常, 3 代表被禁用
    userDisciplinaryRecords: DisciplinaryRecord[];
}

// 💥 查询状态
export const fetchUserStatus = async (userId: string): Promise<UserStatusResponse> => {
    const response = await axios.get(`/api/v1/twin/scan/user-status?userId=${userId}`);
    return asData<UserStatusResponse>(response.data, { state: 0, userDisciplinaryRecords: [] } as UserStatusResponse);
};

// 💥 修改状态 (valid: true为解封，false为禁用)
export const updateUserState = async (userId: string, valid: boolean) => {
    const response = await axios.post('/api/v1/twin/scan/user-status/update', {
        userId,
        valid,
        invalidReason: null
    });
    // 如果返回失败则抛出异常
    if (response.data.code !== 200 && response.data.success !== true) {
        throw new Error(response.data.msg || response.data.message || '官方接口拒绝操作');
    }
    return response.data;
};

// ==========================================
// 💥 宏观空间调度雷达 API
// ==========================================

// 触发全局重算
export const triggerGroupHeatmapRecalc = async () => {
    const res = await axios.get('/api/v1/twin/prediction/admin/recalc-group');
    return res.data;
};

// 获取房间列表导航册
export const fetchPredictionRoomList = async () => {
    const res = await axios.get('/api/v1/twin/prediction/room-list');
    return res.data.data || [];
};

export const fetchGroupHeatmapByRoom = async (roomId: string) => {
    const res = await axios.get(`/api/v1/twin/prediction/group-heatmap?roomId=${roomId}`);
    return res.data.data; // 现在返回的是 { roomData: [], suiteData: [], suiteId: "", suiteName: "" }
};

// 获取房间上限
export const fetchRoomCapacity = async (roomId: string, physicalRoomName?: string) => {
    const res = await axios.get('/api/v1/twin/prediction/room-capacity', {
        params: { roomId, physicalRoomName }
    });
    return res.data.data;
};

// 设置房间上限
export const updateRoomCapacity = async (roomId: string, capacity: number, physicalRoomName?: string) => {
    const res = await axios.post('/api/v1/twin/prediction/room-capacity', { roomId, capacity, physicalRoomName });
    return res.data;
};

// 💥 获取指定房间的实时房卡与人数状态
export const fetchRoomCardStatus = async (roomId: string) => {
    // 等你后端写好后，替换成真实的 API 路径
    // const res = await axios.get(`/api/v1/room/card-status?roomId=${roomId}`);
    // return res.data.data;

    return;
};

// 2. 在文件最底部，加上咱们获取房卡监控的 API (替换掉之前写死随机数的旧函数)：
export interface RoomCardStatus {
    roomId: string;
    roomName: string;
    maxCapacity: number;
    currentPeople: number;
    borrowedCards: number;
}

export const fetchAllRoomCardStatus = async (): Promise<RoomCardStatus[]> => {
    // 💥 请求你刚刚写在 TwinScanController 里的接口！
    const res = await axios.get('/api/v1/twin/scan/room/card-status');
    return res.data.data || [];
};


// 📊 获取多维过滤流水列表
export const fetchFilteredDebugLogs = async (params: Record<string, string | number | boolean | undefined>) => {
    const res = await axios.get('/api/v1/twin/dashboard/debug/logs/filter', { params });
    return res.data?.data || { data: [], total: 0 };
};

// 📊 获取聚合统计数据 (KPI)
export const fetchFilteredDebugStats = async (params: Record<string, string | number | boolean | undefined>) => {
    const res = await axios.get('/api/v1/twin/dashboard/debug/stats', { params });
    return asMapData(res.data?.data);
};

// 🛡️ 黑名单管理 API
export const fetchBlacklist = async () => {
    const res = await axios.get('/api/v1/twin/dashboard/debug/blacklist');
    return asArrayData(res.data?.data);
};

export const addToBlacklist = async (data: { userId: string; name: string; reason: string }) => {
    const res = await axios.post('/api/v1/twin/dashboard/debug/blacklist', data);
    return res.data;
};

export const removeFromBlacklist = async (userId: string) => {
    const res = await axios.delete(`/api/v1/twin/dashboard/debug/blacklist/${userId}`);
    return res.data;
};

// ==========================================
// 💳 物理卡片与人员映射字典 API
// ==========================================

export interface CardMappingRow {
    id?: number;
    cardNo: string;
    aroUserId?: string;
    userName?: string;
    jobNumber?: string;
    projectGroupName?: string;
    dahuaSeq?: string;
    dahuaPersonCode?: string;
    cardStatus?: string;
    freezeExemptFlag?: number;
    lastModifiedTime?: string;
    [key: string]: any;
}

// 1. 获取映射列表 (支持分页)
export const fetchCardMappings = async (page: number, pageSize: number): Promise<{ list: CardMappingRow[]; total: number }> => {
    // 假设后端返回标准 Result: { data: { list: [], total: 100 }, success: true }
    const res = await authHttp.get(`/v1/twin/mappings`, { params: { page, pageSize } });
    return res.data?.data || { list: [], total: 0 };
};

// 2. 搜索映射 (姓名、工号或卡号)
export const searchCardMappings = async (keyword: string): Promise<CardMappingRow[]> => {
    const res = await authHttp.get(`/v1/twin/mappings/search`, { params: { keyword } });
    return res.data?.data || [];
};

// 3. 切换特权免死金牌 (1=豁免, 0=受控)
export const updateExemptFlag = async (cardNo: string, flag: number) => {
    const res = await authHttp.post(`/v1/twin/mappings/exempt`, { cardNo, flag });
    return res.data;
};

// 4. 强制冻结/解冻卡片 (NORMAL / FROZEN)
export const updateCardStatus = async (cardNo: string, status: string) => {
    const res = await authHttp.post(`/v1/twin/mappings/status`, { cardNo, status });
    return res.data;
};

// 5. 录入新物理卡绑定 (真实绑定)
export const addCardMapping = async (payload: { cardNo: string, dahuaSeq: string, aroUserId: string, cardStatus: string, freezeExemptFlag: number }) => {
    const res = await authHttp.post(`/v1/twin/mappings/add`, payload);
    return res.data;
};

export const deleteCardMapping = async (cardNo: string) => {
    const res = await authHttp.delete(`/v1/twin/mappings/${cardNo}`);
    return res.data;
};

export const runManualReaper = async () => {
    const res = await authHttp.post(`/v1/twin/mappings/debug/run-reaper`);
    return res.data;
};

export interface DahuaDepartmentRow {
    id: number;
    parentId?: number | null;
    deptCode?: string;
    deptName?: string;
    name?: string;
    [key: string]: any;
}

export interface DahuaDoorGroupRow {
    id: number;
    groupCode?: string;
    name?: string;
    [key: string]: any;
}

export interface DahuaDeviceChannelRemarkCategory {
    id: number;
    name: string;
    sortOrder?: number | null;
    [key: string]: any;
}

export interface DahuaDeviceChannelRow {
    id: number;
    deviceCode?: string;
    channelCode?: string;
    channelName?: string;
    remarkCategoryId?: number | null;
    [key: string]: any;
}

type DahuaPagedList<T> = {
    list: T[];
    total: number;
    [key: string]: any;
};

export const fetchDahuaDepartments = async (page: number = 1, pageSize: number = 50, keyword: string = ""): Promise<DahuaPagedList<DahuaDepartmentRow>> => {
    const res = await authHttp.get('/v1/dahua/meta/departments', { params: { page, pageSize, keyword } });
    return asData<DahuaPagedList<DahuaDepartmentRow>>(res.data, { list: [], total: 0 });
};

export const refreshDahuaDepartments = async () => {
    const res = await authHttp.post('/v1/dahua/meta/departments/refresh');
    return res.data;
};

export const fetchDahuaDoorGroups = async (page: number = 1, pageSize: number = 50, keyword: string = ""): Promise<DahuaPagedList<DahuaDoorGroupRow>> => {
    const res = await authHttp.get('/v1/dahua/meta/door-groups', { params: { page, pageSize, keyword } });
    return asData<DahuaPagedList<DahuaDoorGroupRow>>(res.data, { list: [], total: 0 });
};

export const refreshDahuaDoorGroups = async () => {
    const res = await authHttp.post('/v1/dahua/meta/door-groups/refresh');
    return res.data;
};

export const fetchDahuaDeviceChannels = async (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    channelType?: string;
    ownerCode?: string;
    unitType?: number;
    remarkCategoryId?: number;
    unassignedOnly?: boolean;
} = {}): Promise<DahuaPagedList<DahuaDeviceChannelRow>> => {
    const res = await authHttp.get('/v1/dahua/meta/device-channels', { params });
    return asData<DahuaPagedList<DahuaDeviceChannelRow>>(res.data, { list: [], total: 0 });
};

export const fetchDahuaDeviceChannelRemarkCategories = async (): Promise<DahuaDeviceChannelRemarkCategory[]> => {
    const res = await authHttp.get('/v1/dahua/meta/device-channels/remark-categories');
    return asArrayData(res.data?.data || res.data);
};

export const createDahuaDeviceChannelRemarkCategory = async (payload: { name: string; sortOrder?: number | null }) => {
    const res = await authHttp.post('/v1/dahua/meta/device-channels/remark-categories', payload);
    return res.data;
};

export const updateDahuaDeviceChannelRemarkCategory = async (
    id: number,
    payload: { name: string; sortOrder?: number | null }
) => {
    const res = await authHttp.put(`/v1/dahua/meta/device-channels/remark-categories/${id}`, payload);
    return res.data;
};

export const deleteDahuaDeviceChannelRemarkCategory = async (id: number) => {
    const res = await authHttp.delete(`/v1/dahua/meta/device-channels/remark-categories/${id}`);
    return res.data;
};

export const patchDahuaDeviceChannelRemark = async (id: number, remarkCategoryId: number | null) => {
    const res = await authHttp.patch(`/v1/dahua/meta/device-channels/${id}/remark`, { remarkCategoryId });
    return res.data;
};

export const refreshDahuaDeviceChannels = async () => {
    const res = await authHttp.post('/v1/dahua/meta/device-channels/refresh');
    return res.data;
};

export const fetchDoorControlChannels = async (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    channelType?: string;
    remarkCategoryId?: number;
} = {}): Promise<DahuaPagedList<DahuaDeviceChannelRow>> => {
    const res = await authHttp.get('/v1/dahua/door-control/channels', { params });
    return asData<DahuaPagedList<DahuaDeviceChannelRow>>(res.data, { list: [], total: 0 });
};

export const executeDoorControl = async (payload: {
    mode: "OPEN" | "CLOSE" | "STAY_OPEN" | "STAY_CLOSE" | "NORMAL";
    channelCodeList: string[];
}) => {
    const res = await authHttp.post('/v1/dahua/door-control/execute', payload);
    return asData<Record<string, any>>(res.data, {});
};

export const queryDoorControlStatus = async (payload: {
    channelCode?: string;
    channelCodes?: string[];
    doorGroupId?: number;
}) => {
    const res = await authHttp.post('/v1/dahua/door-control/status', payload);
    return asData<{ success?: boolean; rows?: Array<Record<string, any>>; upstream?: Record<string, any> }>(res.data, { rows: [] });
};

export const fetchFreezeConfig = async () => {
    const res = await authHttp.get('/v1/twin/mappings/freeze-config');
    return asMapData(res.data?.data || res.data);
};

export const saveFreezeConfig = async (payload: {
    enabled: boolean;
    freezeTime: string;
    secondFreezeTime?: string;
    secondFreezeAutoSignoutEnabled?: boolean;
    timezone?: string;
}) => {
    const res = await authHttp.put('/v1/twin/mappings/freeze-config', payload);
    return res.data;
};

export interface TwinAccessRuleScanLinkageConfig {
    enterDispatchEnabled?: boolean;
    exitDispatchEnabled?: boolean;
    updatedBy?: string | null;
    updatedAt?: string | null;
}

export const fetchAccessRuleScanLinkageConfig = async (): Promise<TwinAccessRuleScanLinkageConfig> => {
    const res = await authHttp.get('/v1/twin/mappings/access-rule-scan-linkage-config');
    return asMapData(res.data?.data || res.data) as TwinAccessRuleScanLinkageConfig;
};

export const saveAccessRuleScanLinkageConfig = async (payload: {
    enterDispatchEnabled: boolean;
    exitDispatchEnabled: boolean;
}) => {
    const res = await authHttp.put('/v1/twin/mappings/access-rule-scan-linkage-config', payload);
    return res.data;
};

export interface DahuaIssueRuleMatchRow {
    matchKey: string;
    itemId: number;
    ruleId: number;
    ruleName: string;
    roomId: string;
    roomName: string;
    channelResourceCodes: string[];
    doorGroupIds: number[];
    hasPrivilege: boolean;
    defaultSelected: boolean;
}

export interface DahuaIssueAccessPrefill {
    aroUserId: string;
    officialRooms?: unknown[];
    officialRoomsNormalized?: Array<{ roomId: string; roomName: string }>;
    ruleMatches: DahuaIssueRuleMatchRow[];
    defaultChannelResourceCodes: string[];
    defaultDoorGroupIds: number[];
}

export const fetchDahuaIssueAccessPrefill = async (aroUserId: string): Promise<DahuaIssueAccessPrefill> => {
    const res = await authHttp.get('/v1/twin/mappings/dahua-issue/access-prefill', { params: { aroUserId } });
    return asData<DahuaIssueAccessPrefill>(res.data, {
        aroUserId,
        ruleMatches: [],
        defaultChannelResourceCodes: [],
        defaultDoorGroupIds: [],
    });
};

export const issueDahuaCard = async (payload: {
    cardNo: string;
    aroUserId: string;
    userName: string;
    departmentId: number;
    channelResourceCodes: string[];
    doorGroupIds: number[];
}) => {
    const res = await authHttp.post('/v1/twin/mappings/dahua-issue', payload);
    return asData<{
        success?: boolean;
        failStep?: string;
        steps?: Array<{
            stepName?: string;
            success?: boolean;
            upstreamCode?: string;
            upstreamErrMsg?: string;
            message?: string;
        }>;
    }>(res.data, {});
};

export interface RoomMappingRoomRow {
    id?: number;
    roomId: string;
    roomName?: string;
    regionName?: string;
    floorName?: string;
    /** ARO 官方可进房间接口同步的 level，数字越小权限越高 */
    officialPermissionLevel?: number | null;
    [key: string]: any;
}

export interface RoomMappingFacets {
    regions: string[];
    floors: string[];
    floorsByRegion?: Record<string, string[]>;
    tags?: string[];
    [key: string]: any;
}

export const fetchRoomMappingRooms = async (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    regionName?: string;
    floorName?: string;
    tagFilter?: string;
    includeChannels?: boolean;
} = {}): Promise<{ list: RoomMappingRoomRow[]; total: number }> => {
    const res = await authHttp.get('/v1/room-mapping/rooms', { params });
    return asData<{ list: RoomMappingRoomRow[]; total: number }>(res.data, { list: [], total: 0 });
};

export const fetchRoomMappingFacets = async (): Promise<RoomMappingFacets> => {
    const res = await authHttp.get('/v1/room-mapping/facets');
    return asData<RoomMappingFacets>(res.data, { regions: [], floors: [], tags: [] });
};

export const refreshRoomMappingFromClasspath = async () => {
    const res = await authHttp.post('/v1/room-mapping/refresh-from-classpath');
    return asData<Record<string, any>>(res.data, {});
};

/** 手动覆盖或清空官方权限等级；level 为 null 表示清空为未配置 */
export const patchRoomOfficialPermissionLevel = async (roomId: string, officialPermissionLevel: number | null) => {
    const res = await authHttp.patch(`/v1/room-mapping/rooms/${encodeURIComponent(roomId)}/official-permission-level`, {
        officialPermissionLevel,
    });
    return asData<RoomMappingRoomRow>(res.data, { roomId });
};

export interface AccessRuleItemPayload {
    id?: number;
    roomId: string;
    channelCodes: string[];
    doorGroupIds: number[];
    aroUserIds: string[];
    sortOrder?: number;
}

export interface AccessRuleDetailView {
    id: number;
    ruleCode: string;
    name: string;
    enabled: boolean;
    createdAt?: string;
    updatedAt?: string;
    items: AccessRuleItemPayload[];
    [key: string]: any;
}

export interface AccessRuleListRow {
    id: number;
    ruleCode: string;
    name: string;
    enabled: number | boolean;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: any;
}

export const fetchAccessRules = async (params: {
    page?: number;
    pageSize?: number;
    keyword?: string;
} = {}): Promise<{ list: AccessRuleListRow[]; total: number; page?: number; pageSize?: number }> => {
    const res = await authHttp.get('/v1/access-rules', { params });
    return asData<{ list: AccessRuleListRow[]; total: number; page?: number; pageSize?: number }>(
        res.data,
        { list: [], total: 0 }
    );
};

export const fetchAccessRuleDetail = async (id: number): Promise<AccessRuleDetailView> => {
    const res = await authHttp.get(`/v1/access-rules/${id}`);
    return asData<AccessRuleDetailView>(res.data, {
        id,
        ruleCode: "",
        name: "",
        enabled: true,
        items: [],
    });
};

export const createAccessRule = async (payload: {
    name: string;
    enabled: boolean;
    items: AccessRuleItemPayload[];
}) => {
    const res = await authHttp.post('/v1/access-rules', payload);
    return res.data;
};

export const updateAccessRule = async (id: number, payload: {
    name: string;
    enabled: boolean;
    items: AccessRuleItemPayload[];
}) => {
    const res = await authHttp.put(`/v1/access-rules/${id}`, payload);
    return res.data;
};

export const deleteAccessRule = async (id: number) => {
    const res = await authHttp.delete(`/v1/access-rules/${id}`);
    return res.data;
};

// 在你现有的 twinApi.ts 中追加：
export const fetchMyRoomConfigs = async () => {
    const res = await authHttp.get('/v1/twin/config/rooms');
    // 根据你的 Result 结构解包，确保这里返回的是数组
    return res.data.data;
};

export const createRoomConfig = async (payload: {
    campus: string;
    roomName: string;
    capacity: number;
    mappingAliases: string;
    /** 与 aro_access_log.room_id 一致，满员与监控索引用 */
    capacityBindRoomId?: string;
}) => {
    const res = await authHttp.post('/v1/twin/config/rooms', payload);
    return res.data;
};

export const updateRoomCapacityBindRoomId = async (id: number, capacityBindRoomId: string) => {
    const res = await authHttp.put(`/v1/twin/config/rooms/${id}/capacity-bind-room-id`, null, {
        params: { capacityBindRoomId },
    });
    return res.data;
};

export const deleteRoomConfig = async (id: number) => {
    const res = await authHttp.delete(`/v1/twin/config/rooms/${id}`);
    return res.data;
};

export const fetchRoomOverview = async () => {
    const res = await axios.get('/api/v1/twin/dashboard/wechat-overview');
    return res.data.data;
}

export interface AutomationLogRow {
    id: number;
    automationType: string;
    eventKey?: string;
    triggerType?: string;
    triggerReason?: string;
    userId?: string;
    userName?: string;
    targetId?: string;
    success?: number;
    detail?: string;
    /** 后端展开 state/通道名/房间名后的展示文案；无则前端用 detail */
    detailDisplayZh?: string;
    eventTime?: string;
    createdBy?: string;
    automationTypeLabel?: string;
    eventKeyLabel?: string;
    triggerTypeLabel?: string;
    triggerReasonLabel?: string;
}

export interface AutomationDisplayMapRow {
    id?: number;
    codeType: string;
    codeValue: string;
    labelZh: string;
    remark?: string;
    updateTime?: string;
}

export const fetchAutomationDisplayMaps = async (): Promise<AutomationDisplayMapRow[]> => {
    const res = await authHttp.get("/v1/twin/automation-display-map");
    return asData<AutomationDisplayMapRow[]>(res.data, []);
};

export const createAutomationDisplayMap = async (payload: Omit<AutomationDisplayMapRow, "id" | "updateTime">) => {
    const res = await authHttp.post("/v1/twin/automation-display-map", payload);
    return asData<number>(res.data, 0);
};

export const updateAutomationDisplayMap = async (id: number, payload: Omit<AutomationDisplayMapRow, "updateTime">) => {
    const res = await authHttp.put(`/v1/twin/automation-display-map/${id}`, payload);
    return asData<number>(res.data, 0);
};

export const deleteAutomationDisplayMap = async (id: number) => {
    const res = await authHttp.delete(`/v1/twin/automation-display-map/${id}`);
    return asData<number>(res.data, 0);
};

export const fetchAutomationLogs = async (params: {
    automationType?: string;
    triggerType?: string;
    keyword?: string;
    startTime?: string;
    endTime?: string;
    page?: number;
    pageSize?: number;
    /** 默认 true：列表隐藏 ARO_PENETRATION_POLL 穿甲轮询日志 */
    excludePenetrationPoll?: boolean;
}): Promise<{ list: AutomationLogRow[]; total: number; page: number; pageSize: number }> => {
    const res = await authHttp.get('/v1/twin/automation-logs', { params });
    return asData<{ list: AutomationLogRow[]; total: number; page: number; pageSize: number }>(
        res.data,
        { list: [], total: 0, page: 1, pageSize: 20 }
    );
};