-- 每统计任务仅保留一个「活」数据包（upsert，不产生历史包）
-- 目标库见 application.properties（如 twin_system）；若已有同任务多包，先执行清理段

-- 可选：删除同任务旧包，仅保留 id 最大的一条（执行前请备份）
-- DELETE p FROM access_clean_package p
-- INNER JOIN (
--   SELECT stats_task_id, MAX(id) AS keep_id FROM access_clean_package GROUP BY stats_task_id
-- ) k ON p.stats_task_id = k.stats_task_id AND p.id <> k.keep_id;

ALTER TABLE access_clean_package
    ADD UNIQUE KEY uk_clean_package_task (stats_task_id);
