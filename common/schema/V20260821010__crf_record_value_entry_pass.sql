-- NHP 双录入：同一 record+field 可存一录(pass=1)与二录(pass=2)。
-- 既有行默认 entry_pass=1；比对时 pass1 vs pass2。
-- 运行时由 EmbeddedTwinSystemCoreDdlBootstrap 执行
--   classpath:db/bootstrap-nhp-crf-record-value-entry-pass.sql（幂等）。
-- 本文件为归档/手工迁移。

ALTER TABLE crf_record_value
    ADD COLUMN entry_pass TINYINT NOT NULL DEFAULT 1 COMMENT '1=一录 2=二录' AFTER entry_mode;

-- 清理可能的重复（保留最小 id）后再加唯一约束
DELETE t1 FROM crf_record_value t1
INNER JOIN crf_record_value t2
  ON t1.record_id = t2.record_id
 AND t1.field_id = t2.field_id
 AND COALESCE(t1.entry_pass, 1) = COALESCE(t2.entry_pass, 1)
 AND t1.id > t2.id;

ALTER TABLE crf_record_value
    ADD UNIQUE KEY uk_crf_rv_record_field_pass (record_id, field_id, entry_pass);
