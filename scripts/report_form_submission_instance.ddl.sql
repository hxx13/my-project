-- 个人填报多份子文件：为 report_form_submission 增加 instance_label
-- 目标库（默认 twin_system）执行一次；已有 uk_form_user 需先删除再建新唯一键

ALTER TABLE `report_form_submission`
  ADD COLUMN `instance_label` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '个人多份填报子文件名称，空=默认单份' AFTER `user_id`;

ALTER TABLE `report_form_submission` DROP INDEX `uk_form_user`;

ALTER TABLE `report_form_submission`
  ADD UNIQUE KEY `uk_form_user_instance` (`form_id`, `user_id`, `instance_label`);
