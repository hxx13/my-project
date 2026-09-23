-- 培训证书表（幂等：CREATE TABLE IF NOT EXISTS）
CREATE TABLE IF NOT EXISTS training_certificate (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL COMMENT '受训人（sys_user.id）',
  person_name VARCHAR(128) NULL COMMENT '证书姓名（快照）',
  template_key VARCHAR(32) NOT NULL COMMENT '模板：FACILITY_ACCESS/EUTHANASIA/INJECTION',
  template_version VARCHAR(32) NULL COMMENT '发证时的模板版本（快照）',
  training_id BIGINT NULL,
  training_name VARCHAR(255) NULL COMMENT '培训名称（快照）',
  occurrence_id BIGINT NULL,
  enrollment_id BIGINT NULL COMMENT '来源报名记录',
  training_date DATE NULL COMMENT '培训日期（场次开始日期）',
  trainer_name VARCHAR(128) NULL COMMENT '培训者签字（场次 examiner_name）',
  issued_at DATETIME NULL,
  UNIQUE KEY uk_cert_enroll_template (enrollment_id, template_key),
  KEY idx_cert_person (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
