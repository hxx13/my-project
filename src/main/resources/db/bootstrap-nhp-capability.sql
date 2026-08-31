-- NHP 内置能力字典（预配置，不可新增）。与 common/schema/V20260831__nhp_capability.sql 同源。
-- 能力由后端强制逻辑识别，前端不可新增（新增无法真正控制行为）。

CREATE TABLE IF NOT EXISTS crf_capability (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(64)  NOT NULL COMMENT '能力码，如 crf:view / config:manage',
    label       VARCHAR(128) NOT NULL COMMENT '中文名',
    scope       VARCHAR(32)  NULL COMMENT '作用域（预留）',
    active      TINYINT      NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_capability_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP内置能力字典（预配置，不可新增）';

-- 清理历史探索期的能力（避免残留进矩阵）
DELETE FROM crf_capability WHERE code IN (
  'crf:entry', 'dict:write', 'dict:review', 'codelist:write', 'codelist:review',
  'scheme:write', 'scheme:review', 'team:manage', 'team:dissolve', 'project:create', 'global:config'
);

INSERT IGNORE INTO crf_capability (code, label, scope) VALUES
('crf:view','查看',NULL),
('crf:edit','编辑',NULL),
('crf:freeze','冻结',NULL),
('crf:verify','校对',NULL),
('crf:export','导出',NULL),
('crf:delete','删除',NULL),
('config:manage','配置权限',NULL);
