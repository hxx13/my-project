-- 学生违规表：新增来源字段，区分手动新建(MANUAL)与自动滞留检测(AUTO_STRANDED)
ALTER TABLE twin_student_violation
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'MANUAL'
  COMMENT '来源：MANUAL=手动新建, AUTO_STRANDED=自动滞留检测';

-- 滞留违规配置表
CREATE TABLE IF NOT EXISTS stranded_violation_config (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用',
  auto_signout_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否同时执行签退',
  violation_text_tpl VARCHAR(500) DEFAULT '${name}(${dept})滞留未签退，系统自动登记' COMMENT '违规文案模板',
  forbid_enter TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否禁止进入',
  expire_after_days INT NOT NULL DEFAULT 1 COMMENT '自动过期天数',
  whitelist_depts JSON DEFAULT NULL COMMENT '白名单部门JSON数组',
  last_execution_at DATETIME DEFAULT NULL COMMENT '上次执行时间',
  last_execution_result VARCHAR(255) DEFAULT NULL COMMENT '上次执行结果',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日滞留人员自动违规配置';

-- 默认插入一行配置
INSERT INTO stranded_violation_config (id, enabled) VALUES (1, 0)
ON DUPLICATE KEY UPDATE id=id;
