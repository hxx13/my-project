-- NHP schedule / 调度层（archive; runtime bootstrap-nhp-schedule.sql）
-- V20260821034 §6.1/6.2
-- schedule = event_anchor + frequency on crf_form（NO repeat_flag）
-- crf_record already has visit_instance_id — only ADD atom_id + transplant_id
-- capture_form is V35, not here

ALTER TABLE crf_form
    ADD COLUMN IF NOT EXISTS event_anchor VARCHAR(32) NULL COMMENT '事件锚点 ENROLL/PRE_TX/DAY0/POST_TX/…' AFTER description;

ALTER TABLE crf_form
    ADD COLUMN IF NOT EXISTS frequency VARCHAR(32) NULL COMMENT '频次 ONCE/PER_TP/EVENT/…；≠ONCE 即重复' AFTER event_anchor;

ALTER TABLE crf_visit
    ADD COLUMN IF NOT EXISTS end_days INT NULL COMMENT '重复时点右边界天数（如 TP07=180）' AFTER late_days;

ALTER TABLE crf_visit_instance
    ADD COLUMN IF NOT EXISTS transplant_id BIGINT NULL COMMENT 'FK→crf_transplant；供体/术前/灌注可为 NULL' AFTER visit_id;

ALTER TABLE crf_record
    ADD COLUMN IF NOT EXISTS atom_id BIGINT NULL COMMENT '逻辑原子 FK→crf_form.id（版本无关）' AFTER visit_instance_id;

ALTER TABLE crf_record
    ADD COLUMN IF NOT EXISTS transplant_id BIGINT NULL COMMENT 'FK→crf_transplant' AFTER atom_id;
