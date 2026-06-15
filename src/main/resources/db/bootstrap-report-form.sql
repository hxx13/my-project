-- bootstrap-report-form.sql — 填报报表模块 DDL（启动自动建表）
-- 与 scripts/report_form.ddl.sql 保持同步

CREATE TABLE IF NOT EXISTS `report_form_definition` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` VARCHAR(255) NOT NULL COMMENT '报表名称',
  `description` VARCHAR(1000) DEFAULT NULL COMMENT '描述',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft|published|archived',
  `layout_json` MEDIUMTEXT COMMENT '网格 cells[] + fields{}',
  `theme_json` MEDIUMTEXT COMMENT '表头/斑马纹/边框/字体/行列尺寸',
  `fill_policy_json` MEDIUMTEXT COMMENT 'mode+submitLabel+allowEditAfterSubmit',
  `permission_json` MEDIUMTEXT COMMENT 'visibleRoles[]+fieldRoleBindings{}',
  `schedule_json` MEDIUMTEXT COMMENT 'period(daily/weekly/monthly)+timeWindow',
  `word_template_ids_json` JSON DEFAULT NULL COMMENT '绑定的Word打印模板',
  `version_snapshots_json` MEDIUMTEXT COMMENT '发布历史快照数组',
  `created_by` VARCHAR(64) DEFAULT NULL COMMENT '创建人',
  `updated_by` VARCHAR(64) DEFAULT NULL COMMENT '最后编辑人',
  `pinned` TINYINT NOT NULL DEFAULT 0 COMMENT '是否置顶 0/1',
  `published_by` VARCHAR(64) DEFAULT NULL COMMENT '发布人',
  `published_at` DATETIME DEFAULT NULL COMMENT '发布时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_report_form_status` (`status`),
  KEY `idx_report_form_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='填报报表模板';

CREATE TABLE IF NOT EXISTS `report_form_submission` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `form_id` BIGINT NOT NULL COMMENT 'FK→definition',
  `user_id` BIGINT NOT NULL COMMENT '填写人ID，协同模式=0',
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft|submitted',
  `field_values_json` MEDIUMTEXT COMMENT '{fieldKey:value}',
  `version` INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  `submitted_at` DATETIME DEFAULT NULL COMMENT '提交时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_user` (`form_id`, `user_id`),
  KEY `idx_submission_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='填报记录';

CREATE TABLE IF NOT EXISTS `report_form_submission_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `submission_id` BIGINT NOT NULL COMMENT 'FK→submission',
  `user_id` BIGINT NOT NULL COMMENT '操作人',
  `action` VARCHAR(16) NOT NULL COMMENT 'save|submit',
  `field_values_snapshot_json` MEDIUMTEXT COMMENT '当时数据快照',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_log_submission` (`submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='提交日志';

CREATE TABLE IF NOT EXISTS `report_form_option_set` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` VARCHAR(255) NOT NULL COMMENT '选项集名称',
  `scope` VARCHAR(16) NOT NULL DEFAULT 'global' COMMENT 'global|form',
  `form_id` BIGINT DEFAULT NULL COMMENT '表单私有选项集',
  `items_json` MEDIUMTEXT NOT NULL COMMENT '[{label,sortOrder}]',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_opt_scope` (`scope`),
  KEY `idx_opt_form` (`form_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='选项集';
