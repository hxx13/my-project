-- ============================================================
-- 监控（视频通道）专属的分类树节点。
--
-- 为什么不复用 dahua_device_channel_remark_category：那是**门禁通道**的备注分类，
-- 一套独立的扁平标签。监控这边要的是可分层的文件夹树，两套语义不同、不混用
-- （现场明确要求「监控是独立的一套分类树状列表」）。
--
-- 一个通道只属于一个节点：关系存在 dahua_device_channel_cache.video_category_id 上。
-- 本表只存树本身（parent_id 自引用，0 = 根）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
-- ============================================================
CREATE TABLE IF NOT EXISTS dahua_video_channel_category (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '节点ID',
    parent_id BIGINT NOT NULL DEFAULT 0 COMMENT '父节点ID，0 = 根',
    name VARCHAR(128) NOT NULL COMMENT '节点名称（文件夹名）',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序，越小越靠前',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dvcc_parent_name (parent_id, name),
    INDEX idx_dvcc_parent (parent_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='监控通道分类树（独立于门禁备注分类）';
