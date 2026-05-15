-- 目标库：与 application.properties 中 spring.datasource.url 一致（默认 twin_system）
-- 若已执行 login_branding_invite_chat.ddl.sql 全量脚本，可跳过本文件（表已包含）。
-- 仅补跑通讯录分组时用本脚本。

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
