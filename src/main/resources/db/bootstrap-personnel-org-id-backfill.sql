-- 归属回填：只在 id 为空时按名字解析（改名后文本对不上，也不会清空已有 id）。
-- 说明：本文件故意放多条 UPDATE。仓库「一文件一条 DDL」的规矩只针对可能 benign 失败（撞「列已存在」）的 DDL；
-- 这里都是 UPDATE——要么更新若干行、要么 0 行，都不会 benign 失败，同文件多条安全，勿误以为是漏拆。
UPDATE personnel p JOIN department d ON d.name = p.department_name
   SET p.department_id = d.id
 WHERE p.department_id IS NULL AND p.department_name IS NOT NULL AND p.department_name <> '';
UPDATE personnel p JOIN project_group g ON g.name = p.project_group_name
   SET p.project_group_id = g.id
 WHERE p.project_group_id IS NULL AND p.project_group_name IS NOT NULL AND p.project_group_name <> '';
-- 兼容「一人两组」的历史逗号串（14 行）：优先锚定到「<本人姓名>的课题组」，取不到再取第一个组。
-- 业务口径是一个人一个课题组，这些是历史数据：保留原文展示，但给一个主组 id，
-- 这样「删除课题组时有人则拒绝」的判据不会漏过他们。
UPDATE personnel p JOIN project_group g ON g.name = CONCAT(p.name, '的课题组')
   SET p.project_group_id = g.id
 WHERE p.project_group_id IS NULL AND p.project_group_name LIKE '%,%';

UPDATE personnel p JOIN project_group g ON g.name = TRIM(SUBSTRING_INDEX(p.project_group_name, ',', 1))
   SET p.project_group_id = g.id
 WHERE p.project_group_id IS NULL AND p.project_group_name LIKE '%,%';
