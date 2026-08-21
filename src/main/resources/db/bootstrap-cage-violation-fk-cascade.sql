-- T1-2：笼架父子关联补齐 FK + ON DELETE CASCADE，并清理存量孤儿。
-- 与 common/schema/V20260821001__cage_violation_fk_cascade.sql 内容一致。
-- 注意：ADD CONSTRAINT 不可幂等；若已存在会报错，由 EmbeddedTwinSystemCoreDdlBootstrap /
-- TwinViolationSchemaMigrator 在 information_schema 检测后决定是否执行本脚本中的 FK 段。
-- 本 bootstrap 仅执行可幂等的清理与索引；FK 由 Java migrator 添加。

UPDATE twin_student_violation v
SET v.cage_violation_id = NULL,
    v.updated_at = NOW()
WHERE v.cage_violation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM twin_cage_status_violation p WHERE p.id = v.cage_violation_id
  );

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
