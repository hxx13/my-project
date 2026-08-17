-- AUP 计划书主记录新增「课题组名称」（冗余自 aro_personnel.project_group_name，供学生端按课题组查看/协作编辑）。
-- 幂等：重复执行时列已存在即跳过（启动链 isBenignInChain 判定为良性）。
ALTER TABLE aup_record ADD COLUMN project_group_name VARCHAR(128) NULL COMMENT '课题组名称（冗余自 aro_personnel.project_group_name）' AFTER project_source;
