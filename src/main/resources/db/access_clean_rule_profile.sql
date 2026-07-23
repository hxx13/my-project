CREATE TABLE IF NOT EXISTS access_clean_rule_profile (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(512) NULL,
    debounce_seconds INT NOT NULL DEFAULT 45,
    swing_direction_filter VARCHAR(8) NOT NULL DEFAULT 'ALL' COMMENT 'ALL|ENTER|EXIT',
    auto_clean_package TINYINT NOT NULL DEFAULT 1 COMMENT '1=拉取后自动清洗入库',
    require_mapping TINYINT NOT NULL DEFAULT 0 COMMENT '0=不限制映射(含工作人员);1=仅已映射用户纳入',
    open_success_only TINYINT NOT NULL DEFAULT 1,
    default_door_mode VARCHAR(32) NULL DEFAULT 'DAHUA_ENTER_EXIT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_clean_rule_profile_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
