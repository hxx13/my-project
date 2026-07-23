-- 扫码通告「下次不再自动弹出」：按被扫码人员持久化
-- 目标库：application.properties 中 spring.datasource.url（默认 twin_system）
-- 应用启动时 ScanNoticeAutoSuppressSchemaMigrator 也会自动建表；本脚本供运维/本地手动执行。

CREATE TABLE IF NOT EXISTS twin_scan_notice_auto_suppress (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    target_user_id VARCHAR(64) NOT NULL COMMENT '被扫码人员 ARO user_id',
    notice_kind VARCHAR(20) NOT NULL COMMENT 'violation|unbound|announcement',
    record_id BIGINT NOT NULL COMMENT '违规/公告 id；未绑卡固定 1',
    source_updated_at DATETIME NULL COMMENT 'suppress 时被扫通告 updated_at 快照',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tsna_suppress (target_user_id, notice_kind, record_id),
    KEY idx_tsna_target (target_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码通告：被扫人员下次不再自动弹出';
