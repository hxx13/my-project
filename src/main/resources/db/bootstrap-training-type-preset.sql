-- 培训类型预设库（type_name 来源）。name 唯一保证 INSERT IGNORE 幂等。
CREATE TABLE IF NOT EXISTS training_type_preset (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL COMMENT '类型名称',
  created_at DATETIME NULL,
  UNIQUE KEY uk_training_type_preset_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训类型预设库';

INSERT IGNORE INTO training_type_preset (name, created_at) VALUES
('准入培训', NOW()),
('手术培训', NOW());
