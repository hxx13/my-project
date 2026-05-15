-- twin_system：首页公告表 + sys_user.auth_profile（与 schema.sql 一致）
-- 在目标库执行：USE twin_system; SOURCE 本文件;
-- 若列已存在，ALTER 会报错可忽略。

ALTER TABLE sys_user
    ADD COLUMN auth_profile VARCHAR(32) NULL COMMENT '认证来源:WECHAT_ARO|WEB_PASSWORD';

UPDATE sys_user
SET auth_profile = 'WECHAT_ARO'
WHERE auth_profile IS NULL
  AND open_id IS NOT NULL
  AND mini_bind_type IS NOT NULL
  AND TRIM(mini_bind_type) <> '';

UPDATE sys_user
SET auth_profile = 'WEB_PASSWORD'
WHERE auth_profile IS NULL;

CREATE TABLE IF NOT EXISTS mini_program_announcement (
    id VARCHAR(40) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(600) NULL COMMENT '列表摘要',
    body_html MEDIUMTEXT NULL COMMENT '富文本 HTML',
    published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '1展示0下线',
    sort_order INT NOT NULL DEFAULT 0,
    created_by VARCHAR(64) NULL,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_mp_ann_published (published_at DESC),
    KEY idx_mp_ann_enabled (enabled, published_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小程序/Web 首页公告栏';
