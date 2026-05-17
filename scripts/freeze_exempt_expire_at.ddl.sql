-- twin_card_mapping：豁免时效到期时间（Asia/Shanghai 由应用写入）
-- 目标库默认见 application.properties spring.datasource.url（如 twin_system）
-- 启动应用前在目标库执行本脚本；本地若已启用 TwinCardMappingSchemaMigrator 也会自动补列。

ALTER TABLE twin_card_mapping
    ADD COLUMN freeze_exempt_expire_at DATETIME NULL
        COMMENT '豁免到期时间；到期后定时任务自动收回 freeze_exempt_flag';
