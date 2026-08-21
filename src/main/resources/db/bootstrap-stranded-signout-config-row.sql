-- T2-7 定稿：id=2 签退配置行的规范创建路径为本 SQL（经 EmbeddedTwinSystemCoreDdlBootstrap）。
-- Java TwinViolationSchemaMigrator 不再重复 INSERT；StrandedViolationService.@PostConstruct 仅作旧库兜底。
INSERT INTO stranded_violation_config (id, enabled, auto_signout_enabled)
VALUES (2, 0, 1)
ON DUPLICATE KEY UPDATE id = id;
