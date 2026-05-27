-- 门禁清洗：按大华 enter_or_exit（1=进 2=出）筛选
-- 目标库见 application.properties（默认 twin_system），启动前或上线时执行本脚本一次。

ALTER TABLE access_clean_task_settings
    ADD COLUMN swing_direction_filter VARCHAR(8) NOT NULL DEFAULT 'ALL'
        COMMENT 'ALL|ENTER|EXIT，清洗默认进出筛选' AFTER auto_clean_package;
