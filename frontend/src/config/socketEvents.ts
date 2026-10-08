/** 超级管理员触发：所有已连接 Socket 的前端页执行 location.reload() */
export const SOCKET_CLIENT_FORCE_RELOAD = "CLIENT_FORCE_RELOAD";

// === 新增：刷卡失败灵动岛告警 ===
/** 服务端 → 客户端：触发灵动岛告警 */
export const SOCKET_SWIPE_FAILURE_ALERT = "SWIPE_FAILURE_ALERT";
/** 客户端 → 服务端：管理员标记已读 */
export const SOCKET_SWIPE_FAILURE_ALERT_ACK = "SWIPE_FAILURE_ALERT_ACK";
/** 服务端 → 所有客户端：联动消失 */
export const SOCKET_SWIPE_FAILURE_ALERT_DISMISS = "SWIPE_FAILURE_ALERT_DISMISS";

// === 笼位处理提示灵动岛 ===
/** 服务端 → 客户端：笼位联动违规创建时推送 */
export const SOCKET_CAGE_NOTICE_ALERT = "CAGE_NOTICE_ALERT";
/** 服务端 → 所有客户端：联动消失 */
export const SOCKET_CAGE_NOTICE_ALERT_DISMISS = "CAGE_NOTICE_ALERT_DISMISS";

// === 笼位特殊状态持续超时告警 ===
/** 服务端 → 管理端：告警产生/升级/清除后推送（仅变化计数，客户端据此失效相关查询） */
export const SOCKET_CAGE_STATUS_ALERT_CHANGED = "CAGE_STATUS_ALERT_CHANGED";

// === 门禁卡冻结豁免变更 ===
/**
 * 服务端 → 管理端：豁免授予/收回后推送（手动发卡页、AI 助手、扫码授予、审核、定时收回同源）。
 * 收到即失效卡映射查询 —— 否则「受控/豁免」标识只在改它自己的那个页面上更新。
 */
export const SOCKET_TWIN_EXEMPT_CHANGED = "TWIN_EXEMPT_CHANGED";

// === 物资领用单（商城）状态变更 ===
/**
 * 服务端 → 管理端：领用单新建/出库后推送（手工在页面提交时页面自己会刷，**AI 从服务端开的单没人刷**）。
 * 收到即刷新侧栏「待处理」角标 + 领用相关列表。
 */
export const SOCKET_SUPPLIES_CLAIM_CHANGED = "SUPPLIES_CLAIM_CHANGED";
