-- 一次性：关闭「仅已映射用户」默认，避免未做卡映射的工作人员被自动清洗排除
-- 目标库见 application.properties（默认 twin_system）

UPDATE access_clean_rule_profile SET require_mapping = 0 WHERE require_mapping = 1;
