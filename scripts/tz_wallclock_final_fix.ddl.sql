-- 墙钟时区最终修正（与 TimezoneWallClockFinalFix.java 一致）
-- 目标库：twin_system（见 application.properties spring.datasource.url）
-- 说明：修复 2026-06-22 错误 ±8h 迁移；应用启动时会自动执行一次（哨兵表 _tz_wallclock_final_fix_20260622）。
-- 若需手工执行，请先确认未执行过：SELECT 1 FROM _tz_wallclock_final_fix_20260622 LIMIT 1;

SET @utc_cutoff = '2026-06-13 00:00:00';
SET @supply_cutoff = '2026-06-13 08:00:00';

-- supply：撤销错误 +8h（JVM 已上海后写入的北京时间被误加 8 小时）
UPDATE supply_inventory_movement SET created_at = DATE_SUB(created_at, INTERVAL 8 HOUR) WHERE created_at < @supply_cutoff AND created_at IS NOT NULL;
UPDATE supply_claim_order SET created_at = DATE_SUB(created_at, INTERVAL 8 HOUR) WHERE created_at < @supply_cutoff AND created_at IS NOT NULL;
UPDATE supply_claim_order SET fulfilled_at = DATE_SUB(fulfilled_at, INTERVAL 8 HOUR) WHERE fulfilled_at < @supply_cutoff AND fulfilled_at IS NOT NULL;
UPDATE supply_claim_order SET deleted_time = DATE_SUB(deleted_time, INTERVAL 8 HOUR) WHERE deleted_time < @supply_cutoff AND deleted_time IS NOT NULL;
UPDATE supply_claim_order SET purge_after_time = DATE_SUB(purge_after_time, INTERVAL 8 HOUR) WHERE purge_after_time < @supply_cutoff AND purge_after_time IS NOT NULL;
UPDATE supply_item SET created_at = DATE_SUB(created_at, INTERVAL 8 HOUR) WHERE created_at < @supply_cutoff AND created_at IS NOT NULL;
UPDATE supply_item SET updated_at = DATE_SUB(updated_at, INTERVAL 8 HOUR) WHERE updated_at < @supply_cutoff AND updated_at IS NOT NULL;
UPDATE supply_item SET last_inbound_at = DATE_SUB(last_inbound_at, INTERVAL 8 HOUR) WHERE last_inbound_at < @supply_cutoff AND last_inbound_at IS NOT NULL;
UPDATE supply_operation_log SET created_at = DATE_SUB(created_at, INTERVAL 8 HOUR) WHERE created_at < @supply_cutoff AND created_at IS NOT NULL;

-- material / 工单 / 资产：UTC 壁钟或旧迁移列名错误遗漏 → +8h
UPDATE material_request SET created_at = DATE_ADD(created_at, INTERVAL 8 HOUR) WHERE created_at < @utc_cutoff AND created_at IS NOT NULL;
UPDATE material_request SET fulfilled_at = DATE_ADD(fulfilled_at, INTERVAL 8 HOUR) WHERE fulfilled_at < @utc_cutoff AND fulfilled_at IS NOT NULL;
UPDATE material_request SET first_review_time = DATE_ADD(first_review_time, INTERVAL 8 HOUR) WHERE first_review_time < @utc_cutoff AND first_review_time IS NOT NULL;
UPDATE material_request SET second_review_time = DATE_ADD(second_review_time, INTERVAL 8 HOUR) WHERE second_review_time < @utc_cutoff AND second_review_time IS NOT NULL;
UPDATE material_stock_movement SET created_at = DATE_ADD(created_at, INTERVAL 8 HOUR) WHERE created_at < @utc_cutoff AND created_at IS NOT NULL;

UPDATE repair_order SET create_time = DATE_ADD(create_time, INTERVAL 8 HOUR) WHERE create_time < @utc_cutoff AND create_time IS NOT NULL;
UPDATE repair_order SET start_time = DATE_ADD(start_time, INTERVAL 8 HOUR) WHERE start_time < @utc_cutoff AND start_time IS NOT NULL;
UPDATE repair_order SET finish_time = DATE_ADD(finish_time, INTERVAL 8 HOUR) WHERE finish_time < @utc_cutoff AND finish_time IS NOT NULL;

UPDATE purchase_order SET create_time = DATE_ADD(create_time, INTERVAL 8 HOUR) WHERE create_time < @utc_cutoff AND create_time IS NOT NULL;
UPDATE purchase_order SET start_time = DATE_ADD(start_time, INTERVAL 8 HOUR) WHERE start_time < @utc_cutoff AND start_time IS NOT NULL;
UPDATE purchase_order SET finish_time = DATE_ADD(finish_time, INTERVAL 8 HOUR) WHERE finish_time < @utc_cutoff AND finish_time IS NOT NULL;

UPDATE asset_transfer_request SET create_time = DATE_ADD(create_time, INTERVAL 8 HOUR) WHERE create_time < @utc_cutoff AND create_time IS NOT NULL;
UPDATE asset_transfer_request SET transfer_time = DATE_ADD(transfer_time, INTERVAL 8 HOUR) WHERE transfer_time < @utc_cutoff AND transfer_time IS NOT NULL;
UPDATE asset_transfer_log SET create_time = DATE_ADD(create_time, INTERVAL 8 HOUR) WHERE create_time < @utc_cutoff AND create_time IS NOT NULL;

CREATE TABLE IF NOT EXISTS _tz_wallclock_final_fix_20260622 (
  id INT PRIMARY KEY,
  applied_at DATETIME NOT NULL,
  note VARCHAR(300)
);
INSERT INTO _tz_wallclock_final_fix_20260622 (id, applied_at, note)
VALUES (1, NOW(), 'Manual run of tz_wallclock_final_fix.ddl.sql')
ON DUPLICATE KEY UPDATE applied_at = VALUES(applied_at);
