-- ============================================================
-- agv_coord_config 补齐坐标系缩放列 scale
--
-- 坐标系渲染公式：世界位置 = rotate( (局部坐标 + offset) × scale , rotationDeg )
-- rotation/offset 早已落库，唯独 scale 滞留在浏览器 localStorage，
-- 造成跨机器查看时坐标整体偏移（他机 scale 兜底为 1）。
-- 本脚本把 scale 收归数据库，与 rotation/offset 同级持久化。
--
-- 默认值 1 = 恒等缩放，既有行数据语义不变。
-- 幂等：判断 information_schema 后 ALTER。
-- 同源：common/schema/V20260819__agv_coord_config_scale.sql
-- ============================================================

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agv_coord_config' AND COLUMN_NAME = 'scale');
SET @sql = IF(@col = 0, 'ALTER TABLE agv_coord_config ADD COLUMN scale DOUBLE NOT NULL DEFAULT 1 COMMENT ''坐标系缩放系数(1=原始尺度)''', 'SELECT ''scale exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
