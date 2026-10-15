-- ============================================================
-- 安维迪「报警仪表盘」——告警统计表。
--
-- 页面上右侧那张表：一行一个告警名称（RM201_B_SLV_75），列出了它今天在各设备上的报警次数与合计。
-- 平台按「时间窗」聚合返回，同一窗口反复拉会得到同一批数，所以按
-- (统计日, 设备, 告警名称) 唯一键覆盖写，重复同步不会堆行。
--
-- 这里**不存通道**：同一台设备可能被多个通道引用（交医-隔离包与交医-2 都用 219021），
-- 存通道就变成「后同步的覆盖先前的」。通道归属看 avidity_channel。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。一文件一 DDL。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS avidity_alarm_stat (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    stat_date DATE NOT NULL COMMENT '统计窗口所属日（北京时区）',
    virtual_device_id BIGINT NOT NULL COMMENT '来源设备 ID',
    device_name VARCHAR(128) NULL COMMENT '设备名',
    alarm_name VARCHAR(128) NOT NULL COMMENT '告警名称：RM201_B_SLV_75',
    alarm_content VARCHAR(255) NULL COMMENT '告警内容：RM201_B_75_流量报警',
    alarm_count INT NOT NULL DEFAULT 0 COMMENT '该窗口内报警次数',
    synced_at DATETIME NOT NULL COMMENT '本轮同步时刻',
    UNIQUE KEY uk_avidity_alarm_stat (stat_date, virtual_device_id, alarm_name),
    INDEX idx_avidity_alarm_stat_day (stat_date),
    INDEX idx_avidity_alarm_stat_device (virtual_device_id, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安维迪告警统计（报警仪表盘那张表）';
