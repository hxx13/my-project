-- ============================================================
-- 安维迪「运营仪表盘」的通道。
--
-- 通道就是页面上那排 tab（交医-2 / 交医-B1 / 交医-隔离包），平台侧一个 tab = 一个 Dashboard，
-- tab 里的内容块再指到设备（virtualDeviceId）。这里把「通道 → 设备」摊平成一行一对，
-- 我校前端照着这份清单摆 tab 即可，不必再去解析平台那坨 content JSON。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。一文件一 DDL（同一文件里多条会被前一条的良性失败整段跳过）。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS avidity_channel (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    channel_id BIGINT NOT NULL COMMENT '平台侧 Dashboard ID',
    channel_name VARCHAR(128) NOT NULL COMMENT '通道名：交医-2 / 交医-B1 / 交医-隔离包',
    sort_index INT NOT NULL DEFAULT 0 COMMENT '平台排序号，前端 tab 顺序照它排',
    virtual_device_id BIGINT NOT NULL COMMENT '该通道对应设备 ID',
    device_name VARCHAR(128) NULL COMMENT '设备名：交大医学院二楼',
    synced_at DATETIME NOT NULL COMMENT '本轮同步时刻',
    UNIQUE KEY uk_avidity_channel_device (channel_id, virtual_device_id),
    INDEX idx_avidity_channel_sort (sort_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='安维迪通道（仪表盘 tab → 设备）';
