-- 统计任务：是否参与定时自动清洗并打包落库（历史回溯建议关闭，避免重复重算）
-- 目标库 twin_system

ALTER TABLE access_clean_task_settings
    ADD COLUMN auto_clean_package TINYINT NOT NULL DEFAULT 1
        COMMENT '1=定时任务自动增量清洗打包；0=仅手动试算合并（适合历史回溯）' AFTER debounce_seconds;
