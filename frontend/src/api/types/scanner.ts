export interface RoomInfo {
    id: string;
    name: string;
    areaName?: string;
    floorName?: string;
    officialRoomId?: string;
    displayName?: string;
    regionName?: string;
    /** 浦东 / 浦西（来自 room_mapping_room） */
    campusTag?: string;
    isDisabled?: boolean;
    disableReason?: string;
    /** 系统设置按校区禁用进入（不影响离开） */
    enterBlocked?: boolean;
    enterBlockReason?: string;
}

export interface DisciplinaryRecord {
    id: string;
    createTime: string;
    operateName: string;
    record: string;
}

export interface AnalyzeUserInfo {
    userId: string;
    name: string;
    head: string;
    group: string;
    gender?: number | string;
    mobile_phone?: string;
    department_name?: string;
    project_group_name?: string;
    user_type_names?: string;
    rpg?: {
        level: number;
        exp: number;
        nextLevelExp: number;
    };
}

export interface AnalyzeResponse {
    message: string;
    success: boolean;
    userInfo: AnalyzeUserInfo;
    currentState: "INSIDE" | "OUTSIDE" | "UNKNOWN";
    pendingRooms?: RoomInfo[];
    allowedRooms?: RoomInfo[];
    globalUserState?: number;
    disciplinaryRecords?: DisciplinaryRecord[];
    /** 后端 twin_card_mapping 是否存在该人员；用于指示自带校园卡 / 领用公卡 */
    hasPhysicalCardMapping?: boolean;
    /** 是否启用扫码弹窗入口时段限制（仅限制进入，不限制离开） */
    scanPopupEntryWindowEnabled?: boolean;
    /** 当前时间是否允许扫码进入（仅进入；离开不受此字段限制） */
    scanPopupEntryAllowedNow?: boolean;
    /** 管理员下发的违规通告（扫码弹窗覆盖展示） */
    studentViolationNotice?: StudentViolationNotice;
    /** 未绑卡人员扫码提示（全局配置） */
    unboundCardNotice?: StudentViolationNotice;
    /** 扫码弹窗公告（多条翻页） */
    scanPopupAnnouncements?: ScanPopupAnnouncementBundle;
}

export interface ScanPopupAnnouncementItem {
    id: number;
    title?: string;
    contentHtml?: string;
}

export interface ScanPopupAnnouncementBundle {
    enabled?: boolean;
    showNoticeEveryScan?: boolean;
    total?: number;
    items?: ScanPopupAnnouncementItem[];
}

export interface StudentViolationNotice {
    id: number;
    violationText?: string;
    imageUrls?: string[];
    showNoticeEveryScan?: boolean;
    enterLocked?: boolean;
    /** 剩余允许成功进入次数；未配置上限时为 undefined */
    remainingEnterAllowance?: number | null;
}

export interface ExecutePayload {
    userId: string;
    roomId: string;
    action: "ENTER" | "EXIT";
    isSharedCard?: boolean;
    isKeepCard?: boolean;
    /** 与弹窗「领用公卡」一致 */
    isBorrowedCard?: boolean;
}

export interface UserStatusResponse {
    state: number;
    userDisciplinaryRecords: DisciplinaryRecord[];
    /** If the backend ever returns allowed rooms here, the popup can merge them when scan list is empty. */
    allowedRooms?: RoomInfo[];
}

export interface RoomCardStatus {
    roomId: string;
    roomName: string;
    maxCapacity: number;
    currentPeople: number;
    borrowedCards: number;
}
