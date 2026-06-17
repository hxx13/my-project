-- 扫码弹窗「延迟」按钮：房间选项配置 + 审核申请
-- 目标库见 application.properties（默认 twin_system）
-- 启动应用前或上线时执行本脚本

-- 延迟开关已迁至 twin_dahua_issue；twin_scanner_popup 模块已废弃，见 scripts/twin_scanner_popup_cleanup.ddl.sql

CREATE TABLE IF NOT EXISTS twin_scan_delay_option (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL COMMENT 'ARO 房间 ID',
    room_name VARCHAR(128) NOT NULL COMMENT '房间展示名（配置对照）',
    option_label VARCHAR(64) NOT NULL COMMENT '展开菜单项文案',
    button_label VARCHAR(32) NOT NULL DEFAULT '延迟' COMMENT '主按钮文案',
    display_start VARCHAR(5) NULL COMMENT '显示时段起 HH:mm',
    display_end VARCHAR(5) NULL COMMENT '显示时段止 HH:mm',
    require_approval TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=需教职工审核',
    reviewer_user_ids JSON NULL COMMENT '推荐审核人账号 ID 列表',
    exempt_mode VARCHAR(20) NOT NULL DEFAULT 'TIME' COMMENT 'TIME/COUNT/BOTH',
    duration_minutes INT NULL COMMENT '免冻结时长；-1=今日24:00',
    max_count INT NULL COMMENT '次数上限',
    exempt_room_ids JSON NULL COMMENT '免冻结房间 ID 列表，空则仅当前 room_id',
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tsdo_room (room_id, enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码弹窗延迟按钮-房间菜单项';

CREATE TABLE IF NOT EXISTS twin_scan_delay_request (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_user_id VARCHAR(64) NOT NULL COMMENT '被申请人 ARO userId',
    card_no VARCHAR(64) NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    option_id BIGINT NOT NULL,
    duration_minutes INT NULL,
    reviewer_user_id VARCHAR(64) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED',
    requested_by VARCHAR(64) NULL COMMENT '发起扫码操作账号',
    reviewed_by VARCHAR(64) NULL,
    reviewed_at DATETIME NULL,
    reject_reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tsdr_status (status, created_at),
    KEY idx_tsdr_reviewer (reviewer_user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码延迟免冻结审核单';
