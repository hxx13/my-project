-- 门禁清洗数据包：按 channel_code 唯一（每通道一包），支持增量合并
-- 目标库默认 twin_system；执行前请备份。若已有 uk_clean_package_task 须先迁移旧包数据再删旧唯一键。

ALTER TABLE access_clean_package
    ADD COLUMN IF NOT EXISTS channel_code VARCHAR(128) NULL COMMENT '通道编码，与 stats_task_id 解耦后为主键维度' AFTER stats_task_id;

ALTER TABLE access_clean_package
    ADD COLUMN IF NOT EXISTS last_merged_swing_time DATETIME NULL COMMENT '上次增量合并的最大刷卡时间' AFTER published_at;

-- MySQL 8.0.12+ 支持 IF NOT EXISTS；若版本较低请去掉 IF NOT EXISTS 并忽略重复列错误

UPDATE access_clean_package p
    INNER JOIN (
        SELECT package_id, MAX(channel_code) AS cc
        FROM access_clean_package_item
        WHERE channel_code IS NOT NULL AND channel_code != ''
        GROUP BY package_id
    ) x ON x.package_id = p.id
SET p.channel_code = x.cc
WHERE (p.channel_code IS NULL OR p.channel_code = '');

ALTER TABLE access_clean_package DROP INDEX uk_clean_package_task;

ALTER TABLE access_clean_package ADD UNIQUE KEY uk_clean_package_channel (channel_code);

ALTER TABLE access_clean_package_item
    ADD UNIQUE KEY uk_pkg_item_record (package_id, record_id);
