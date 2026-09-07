CREATE TABLE IF NOT EXISTS training (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(128) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type TINYINT NOT NULL DEFAULT 1 COMMENT '1=准入培训 2=手术培训',
  paper_id BIGINT NULL,
  owner_id VARCHAR(64) NULL COMMENT '所属人（sys_user.id）',
  time_limit INT NULL COMMENT '时间限制（分钟）',
  recurrence VARCHAR(64) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
  created_by VARCHAR(64) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  UNIQUE KEY uk_training_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS training_occurrence (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  training_id BIGINT NOT NULL,
  start_time DATETIME NULL,
  end_time DATETIME NULL,
  address VARCHAR(255) NULL,
  examiner_name VARCHAR(128) NULL,
  examiner_number VARCHAR(128) NULL,
  status VARCHAR(16) NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY idx_occ_training (training_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS training_enrollment (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  occurrence_id BIGINT NOT NULL,
  trainee_id VARCHAR(64) NOT NULL COMMENT 'aro_user_id',
  name VARCHAR(128) NULL,
  job_number VARCHAR(64) NULL,
  project_group VARCHAR(128) NULL,
  test_yn TINYINT NOT NULL DEFAULT 0 COMMENT '0待审/1通过/2拒绝',
  test_fraction TINYINT NOT NULL DEFAULT 0 COMMENT '0未评/1合格/2不合格',
  room_ids_json TEXT NULL,
  rooms_json TEXT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  KEY idx_enroll_occurrence (occurrence_id),
  KEY idx_enroll_trainee (trainee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
