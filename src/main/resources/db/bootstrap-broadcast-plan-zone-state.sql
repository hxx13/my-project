-- 广播分区的独立运行态：方案 × 分区 一行，记录「这一路被人工停过」。
--
-- 为什么需要这张表：方案到点只是**批量启动**若干分区，启动之后每个分区就是独立的播放单元。
-- 人工把其中一路暂停掉，调度器的循环/兜底**不能**把它一起re起来 —— 否则就是把整组重新绑死。
-- 所以人工暂停落一行 paused=1，调度器下发时跳过这些分区；窗口结束收播时清空（下一天重新开始）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
CREATE TABLE IF NOT EXISTS broadcast_plan_zone_state (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plan_id BIGINT NOT NULL COMMENT '所属方案',
    mac VARCHAR(32) NOT NULL COMMENT '分区 MAC',
    paused TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = 人工暂停，方案不得自动恢复',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_plan_mac (plan_id, mac),
    INDEX idx_plan (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广播分区独立运行态（方案×分区）';
