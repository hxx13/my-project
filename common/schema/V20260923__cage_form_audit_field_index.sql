-- 给 cage_form_audit_log 加 (field_code, created_at) 索引，供「按状态字段折叠审计区间」用。
-- 现有索引只有 (target_type, target_id)，按 field_code 折叠全表会扫。
-- 索引名 idx_cage_form_audit_field 不与现有 idx_cage_form_audit_*（category/entity/target/operator）重名。
--
-- 为什么本文件不能走 bootstrap runScript 清单（与「一文件一条 DDL」的坑叠加）：
--   cage_form_audit_log 不是由 EmbeddedTwinSystemCoreDdlBootstrap 建的，而是由
--   CageInfoSchemaMigrator（ApplicationRunner @Order(132)）在启动较晚阶段建的，
--   晚于 bootstrap 的两次执行（InitializingBean.afterPropertiesSet + StartupPhaseRunner @Order(MIN_VALUE)）。
--   若把它塞进 bootstrap，会在表尚未存在时执行，被 isBenignInChain 的 "doesn't exist" 分支吞掉，
--   索引永远建不上。所以实际执行放在 CageInfoSchemaMigrator.ensureAuditFieldIndex()（try/catch 幂等）。
-- 本文件仅作归档记录。
ALTER TABLE cage_form_audit_log
    ADD INDEX idx_cage_form_audit_field (field_code, created_at);
