-- 个人填报多份子文件（增量，列/索引已存在则手动跳过对应语句）
ALTER TABLE `report_form_submission`
  ADD COLUMN `instance_label` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '个人多份填报子文件名称，空=默认单份' AFTER `user_id`;

ALTER TABLE `report_form_submission` DROP INDEX `uk_form_user`;

ALTER TABLE `report_form_submission`
  ADD UNIQUE KEY `uk_form_user_instance` (`form_id`, `user_id`, `instance_label`);
