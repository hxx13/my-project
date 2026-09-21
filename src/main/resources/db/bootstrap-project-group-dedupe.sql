-- 课题组字典去重（与 common/schema/V20260921__project_group_dedupe_uk.sql 同源）。
-- 起因：project_group 表被旧版 schema（注释「归院校」、带 institution_id）先建出来，
-- 导致 V20260816__personnel_unify.sql 里声明的 uk_project_group_name 因
-- CREATE TABLE IF NOT EXISTS 整条被跳过而从未生效 —— 于是人员同步的
-- INSERT ... ON DUPLICATE KEY UPDATE 无键可依，每次同步都新增一批行（已膨胀到 3456 行 / 274 个名字）。
-- 保留每个名字的最小 id：ref_order.project_group_id（9646 条）实测全部指向最小 id，
-- 指向重复行的 0 条，故无需改指任何引用。
-- 幂等：无重复时走 no-op 分支；有重复时重复执行结果一致。
SET @dup = (SELECT COUNT(*) FROM (SELECT name FROM project_group GROUP BY name HAVING COUNT(*) > 1) t);
SET @sql = IF(@dup > 0,
  'DELETE g1 FROM project_group g1 JOIN project_group g2 ON g1.name = g2.name AND g1.id > g2.id',
  'SELECT ''project_group: no duplicates''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
