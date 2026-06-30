-- 第二道滞留签退配置行（id=2）
-- 应用启动时会自动执行（EmbeddedTwinSystemCoreDdlBootstrap + TwinViolationSchemaMigrator + StrandedViolationService）
-- 本脚本仅供 DBA 手工补跑，一般无需手动执行

INSERT INTO stranded_violation_config (id, enabled, auto_signout_enabled)
VALUES (2, 0, 1)
ON DUPLICATE KEY UPDATE id = id;
