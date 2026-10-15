-- ============================================================
-- 平面图上手动挪过的点位。
--
-- 布局是后端按画面 ID 发的静态资源（resources/avidity/<画面ID>.json），改动它要改文件 + 重新发版。
-- 后台页上直接拖动点位、点保存，就落到这张表；取平面图时按 (通道,房间,笼架,点位号) 覆盖上去。
-- 这样调版式不用碰代码，改错了删行就回到原样。
--
-- 存的是**格左上角**坐标（与布局资源里的 x/y 同一口径），不是格心。
-- 幂等：CREATE TABLE IF NOT EXISTS。一文件一 DDL。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS avidity_layout_point (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    channel_id BIGINT NOT NULL COMMENT '通道 ID（Dashboard ID），不同通道的版式各存各的',
    room_code VARCHAR(32) NOT NULL COMMENT '房间/区名，如 205 / E11A',
    rack_code VARCHAR(48) NOT NULL COMMENT '笼架标识，如 205-A / E11A-B105',
    point_no INT NOT NULL COMMENT '点位号',
    pos_x INT NOT NULL COMMENT '格左上角 x（与布局资源同一口径）',
    pos_y INT NOT NULL COMMENT '格左上角 y',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_avidity_layout_point (channel_id, room_code, rack_code, point_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='平面图点位的手动位置覆盖';
