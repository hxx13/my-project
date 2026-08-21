-- T1-2：笼架父子关联补齐 FK + ON DELETE CASCADE，并清理存量孤儿。
-- 子表 cage_violation_id → 父表 twin_cage_status_violation.id
-- 删父时库级级联删子；应用层删父前仍应先走 service 撤回镜像通知。

-- 1) 子记录指向已不存在的父：断链，避免加 FK 失败
UPDATE twin_student_violation v
SET v.cage_violation_id = NULL,
    v.updated_at = NOW()
WHERE v.cage_violation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM twin_cage_status_violation p WHERE p.id = v.cage_violation_id
  );

-- 2) ACTIVE 父记录已无任何 ACTIVE 子记录：清为 CLEARED，避免去重永久挡住该笼位
UPDATE twin_cage_status_violation p
SET p.status = 'CLEARED',
    p.updated_at = NOW()
WHERE p.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM twin_student_violation c
    WHERE c.cage_violation_id = p.id
      AND c.status = 'ACTIVE'
  );

-- 3) 确保子表索引（旧环境可能只有列无索引）
-- MySQL 8.0.13+ 支持 IF NOT EXISTS；失败由 bootstrap/Java 幂等兜底
CREATE INDEX IF NOT EXISTS idx_cage_vid ON twin_student_violation (cage_violation_id);

-- 4) 真实外键 + 删父级联删子
-- 若约束已存在则跳过（由 bootstrap/Java 检测 information_schema）
ALTER TABLE twin_student_violation
  ADD CONSTRAINT fk_tsv_cage_violation
  FOREIGN KEY (cage_violation_id)
  REFERENCES twin_cage_status_violation (id)
  ON DELETE CASCADE;
