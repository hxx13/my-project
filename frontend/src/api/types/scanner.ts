export interface RoomInfo {
    id: string;
    name: string;
    areaName?: string;
    floorName?: string;
    officialRoomId?: string;
    displayName?: string;
    isDisabled?: boolean;
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
