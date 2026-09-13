-- 同一区域可以有多个饲养组长，区域学生能力按**并集**生效：谁开的都算开，任一组长只增不减。
--
-- 原唯一键 (region_type, region_id, capability_code) 表达不了「每人各配各的」：
--   · 第二个人插入同一能力会被 INSERT IGNORE 静默丢弃；
--   · 先保存的人的行会被后保存的人整片删掉（实测：A 配 3 项 → B 配 1 项 → A 的 3 项全没）。
-- 所以键里必须带上 configured_by。
--
-- 幂等：DROP + ADD 写在同一条 ALTER 里，MySQL 按序执行，重复跑结果一致。
--
-- 注意 configured_by 允许 NULL，而唯一索引里 NULL 互不相等 —— 写入侧一律传操作人账号 id，
-- 不要留 NULL，否则同一 (区域,能力) 的 NULL 行可以重复。
ALTER TABLE cage_region_capability
    DROP INDEX uk_cage_region_capability,
    ADD UNIQUE KEY uk_cage_region_capability (region_type, region_id, capability_code, configured_by);
