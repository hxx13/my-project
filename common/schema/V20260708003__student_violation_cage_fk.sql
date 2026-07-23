ALTER TABLE twin_student_violation
  ADD COLUMN IF NOT EXISTS cage_violation_id BIGINT COMMENT '关联 twin_cage_status_violation.id，NULL=非笼架触发',
  ADD INDEX IF NOT EXISTS idx_cage_vid (cage_violation_id);
