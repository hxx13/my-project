-- 变量级「显示在动物房页」开关（旧库升级）。
-- 1=显示在温湿度页/驾驶舱；0=仅参与统一拉取与长期归档。
-- 重复执行时可能报 Duplicate column，initializer 已 continueOnError。

ALTER TABLE telemetry_watchlist_tag
    ADD COLUMN show_in_animal_room TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '1=显示在动物房页/驾驶舱；0=仅拉数与长期归档' AFTER enabled;
