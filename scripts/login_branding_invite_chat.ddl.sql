-- 目标库：与 application.properties 中 spring.datasource.url 一致（默认 twin_system）
-- 部署清单与同类脚本索引见 scripts/DEPLOY_DDL.md
-- 应用内置迁移：与 classpath db/bootstrap-login-branding-invite-chat.sql 须保持内容一致
-- 登录品牌化、推荐码注册、教职工站内信与附件（与 schema.sql 同构）

CREATE TABLE IF NOT EXISTS sys_site_config (
    id VARCHAR(32) PRIMARY KEY,
    config_key VARCHAR(64) NOT NULL,
    config_value_json LONGTEXT NULL COMMENT 'JSON 字符串',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sys_site_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站点键值配置';

CREATE TABLE IF NOT EXISTS registration_invite (
    id VARCHAR(36) PRIMARY KEY,
    code_hash VARCHAR(128) NOT NULL COMMENT 'SHA-256 hex(pepper|code)',
    expires_at DATETIME NOT NULL,
    max_uses INT NOT NULL DEFAULT 1,
    used_count INT NOT NULL DEFAULT 0,
    created_by_user_id VARCHAR(50) NULL,
    invite_kind VARCHAR(16) NOT NULL DEFAULT 'ADMIN' COMMENT 'ADMIN=管理发放,PERSONAL=教职工自助',
    note VARCHAR(255) NULL,
    revoked TINYINT(1) NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_reg_inv_code_hash (code_hash),
    KEY idx_reg_inv_expires (expires_at),
    KEY idx_reg_inv_revoked (revoked),
    KEY idx_reg_inv_kind (invite_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教职工注册推荐码';

CREATE TABLE IF NOT EXISTS chat_conversation (
    id VARCHAR(36) PRIMARY KEY,
    min_user_id VARCHAR(50) NOT NULL,
    max_user_id VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at DATETIME NULL,
    UNIQUE KEY uk_chat_dm (min_user_id, max_user_id),
    KEY idx_chat_min (min_user_id),
    KEY idx_chat_max (max_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教职工一对一对话';

CREATE TABLE IF NOT EXISTS chat_attachment (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    storage_key VARCHAR(512) NOT NULL COMMENT '本地相对路径或未来 OSS key',
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hex CHAR(64) NULL,
    uploaded_by VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_chat_att_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信附件元数据';

CREATE TABLE IF NOT EXISTS chat_message (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(50) NOT NULL,
    body TEXT NULL,
    attachment_id VARCHAR(36) NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_msg_conv_time (conversation_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信消息';

CREATE TABLE IF NOT EXISTS chat_conversation_read (
    user_id VARCHAR(50) NOT NULL COMMENT '读游标所属用户',
    conversation_id VARCHAR(36) NOT NULL,
    last_read_at DATETIME(3) NOT NULL COMMENT '已读到该时间戳（含）之前的消息',
    PRIMARY KEY (user_id, conversation_id),
    KEY idx_ccr_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信会话已读游标（每人每会话一行）';

CREATE TABLE IF NOT EXISTS chat_contact_group (
    id VARCHAR(36) PRIMARY KEY,
    owner_user_id VARCHAR(50) NOT NULL,
    name VARCHAR(64) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ccg_owner_sort (owner_user_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教职工站内信通讯录自定义分组';

CREATE TABLE IF NOT EXISTS chat_contact_assignment (
    owner_user_id VARCHAR(50) NOT NULL,
    peer_user_id VARCHAR(50) NOT NULL,
    group_id VARCHAR(36) NULL COMMENT 'NULL=未分组',
    PRIMARY KEY (owner_user_id, peer_user_id),
    KEY idx_cca_owner (owner_user_id),
    KEY idx_cca_group (group_id),
    CONSTRAINT fk_cca_group FOREIGN KEY (group_id) REFERENCES chat_contact_group(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通讯录联系人与分组关系（仅本人可见）';

-- 默认登录轮播图（可在管理端修改）
INSERT INTO sys_site_config (id, config_key, config_value_json)
VALUES (
    'cfg_login_branding',
    'login_branding',
    '{"heroImageUrls":["https://www.shsmu.edu.cn/images/0b4897a73b135d90d9689a0eab3da1e3.jpg","https://www.shsmu.edu.cn/images/cc9c553dd78d0556312c0599c39395912026.jpg"],"intervalSec":8,"heroCarouselEnabled":true}'
)
ON DUPLICATE KEY UPDATE config_key = VALUES(config_key);
