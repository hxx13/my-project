-- 清理 aro_access_log.exempt_at_exit 死列（豁免记录归一化 Task 4）
-- 该列由 TwinScanFlowSchemaMigrator 启动时创建，全仓库无任何读写方，值恒为默认 0，删除无数据损失。
-- 统一豁免台账已落地 twin_automation_log，migrator 中该列注册已同步移除，重启不会重建。
-- 注意：MySQL 8.0 不支持 DROP COLUMN IF EXISTS；若列已删除，重复执行会报 1091，可安全忽略。
ALTER TABLE aro_access_log DROP COLUMN exempt_at_exit;
