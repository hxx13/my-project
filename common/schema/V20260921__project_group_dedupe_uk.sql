-- 课题组字典：去重 + 补上从未生效的唯一键与部门索引（归档迁移，供服务器手动执行）
--
-- 起因：project_group 表被旧版 schema（注释「归院校」、带 institution_id）先建出来，
-- 导致 V20260816__personnel_unify.sql 里声明的 uk_project_group_name 因
-- CREATE TABLE IF NOT EXISTS 整条被跳过而从未生效 —— 人员同步的
-- INSERT ... ON DUPLICATE KEY UPDATE 无键可依，每次同步都新增一批行（已膨胀到 3456 行 / 274 个名字）。
--
-- 顺序要求：先去重，再加唯一键。反过来的话 ADD UNIQUE 会因重复报 Duplicate entry。
-- 执行前请先备份待删行：
--   SELECT g1.* FROM project_group g1
--   WHERE EXISTS (SELECT 1 FROM project_group g2 WHERE g2.name = g1.name AND g2.id < g1.id);
-- 保留每个名字的最小 id：ref_order.project_group_id（9646 条）实测全部指向最小 id、零引用重复行，无需改指。

-- ① 去重（幂等）
DELETE g1 FROM project_group g1
  JOIN project_group g2 ON g1.name = g2.name AND g1.id > g2.id;

-- ② 补唯一键
ALTER TABLE project_group ADD UNIQUE KEY uk_project_group_name (name);

-- ③ 补部门索引
ALTER TABLE project_group ADD INDEX idx_pg_department (department_id);
