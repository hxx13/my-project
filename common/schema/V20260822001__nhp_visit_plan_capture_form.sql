-- V2 数据形状：表单-事件指派级 capture_form（PANEL/LEDGER/SERIES）
-- 采集形态不再写在表单上（V1 已移除），改由「事件×表单」指派决定。
-- Source: V2-架构总纲.md §三（三×三事件模型）；archive bootstrap-nhp-lifecycle-visit-plan.sql 同步

ALTER TABLE crf_visit_plan
    ADD COLUMN IF NOT EXISTS capture_form VARCHAR(16) NULL COMMENT '采集形态 PANEL/LEDGER/SERIES（表单-事件指派级）' AFTER required;
