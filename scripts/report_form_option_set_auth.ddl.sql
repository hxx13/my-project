-- 选项集按账号体系与创建人隔离（目标库默认 twin_system）
-- 应用启动时 ReportFormOptionSetSchemaMigrator 会幂等执行同等 ALTER

ALTER TABLE `report_form_option_set`
  ADD COLUMN `created_by` VARCHAR(64) NULL COMMENT '创建人登录名（scope=user 时必填）' AFTER `items_json`;

ALTER TABLE `report_form_option_set`
  ADD COLUMN `auth_profile` VARCHAR(32) NULL COMMENT '账号体系: WECHAT_ARO|WEB_PASSWORD' AFTER `created_by`;

ALTER TABLE `report_form_option_set`
  ADD KEY `idx_opt_auth_profile` (`auth_profile`);

ALTER TABLE `report_form_option_set`
  ADD KEY `idx_opt_created_by` (`created_by`);
