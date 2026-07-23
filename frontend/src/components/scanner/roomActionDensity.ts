/** 扫码弹窗内「进/出房间」按钮排布：房间多时缩小，少时保持默认视觉 */
export type RoomActionDensity = "normal" | "compact" | "dense";

export function resolveRoomActionDensity(roomCount: number): RoomActionDensity {
    if (roomCount <= 5) return "normal";
    if (roomCount <= 9) return "compact";
    return "dense";
}
