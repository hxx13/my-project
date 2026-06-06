/** 超级管理员触发：所有已连接 Socket 的前端页执行 location.reload() */
export const SOCKET_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD";

// === 新增：刷卡失败灵动岛告警 ===
/** 服务端 → 客户端：触发灵动岛告警 */
export const SOCKET_SWIPE_FAILURE_ALERT = "SWIPE_FAILURE_ALERT";
/** 客户端 → 服务端：管理员标记已读 */
export const SOCKET_SWIPE_FAILURE_ALERT_ACK = "SWIPE_FAILURE_ALERT_ACK";
/** 服务端 → 所有客户端：联动消失 */
export const SOCKET_SWIPE_FAILURE_ALERT_DISMISS = "SWIPE_FAILURE_ALERT_DISMISS";
