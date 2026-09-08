-- 报名资格占位（人级通用所有培训）：健康报告等「其他内容」的人工合格/不合格。
CREATE TABLE IF NOT EXISTS person_qualification (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL COMMENT 'aro_user_id',
  item_key VARCHAR(64) NOT NULL DEFAULT 'health_report',
  state TINYINT NOT NULL DEFAULT 0 COMMENT '0未提交 1合格 2不合格',
  file_ref TEXT NULL COMMENT '上传报告引用(占位，后续接入真实上传)',
  updated_at DATETIME NULL,
  UNIQUE KEY uk_person_item (person_id, item_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
