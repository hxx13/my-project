-- ============================================================
-- agv_coord_config 补齐坐标系缩放列 scale
--
-- 背景：坐标系有 rotation/offset/scale 三个参数，渲染公式为
--   世界位置 = rotate( (局部坐标 + offset) × scale , rotationDeg )
-- 但历史实现只把 rotation/offset 落库，scale 存在浏览器
-- localStorage["agvCoordScales"]，导致：
--   ① 换一台电脑/浏览器打开时 scale 兜底成 1，坐标整体偏移；
--   ② 旋转时反解的 offset（newOx = rx / scale - centerX）已把本机
--      scale 烘焙进去后写入本表，库中 offset 只在原机器上成立。
-- 本次将 scale 收归数据库，使坐标系配置成为完整的服务端权威数据。
--
-- 默认值 1 = 恒等缩放，对既有行为无副作用。
-- 同源：src/main/resources/db/bootstrap-agv-coord-config-scale.sql
-- ============================================================

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'agv_coord_config' AND COLUMN_NAME = 'scale');
SET @sql = IF(@col = 0, 'ALTER TABLE agv_coord_config ADD COLUMN scale DOUBLE NOT NULL DEFAULT 1 COMMENT ''坐标系缩放系数(1=原始尺度)''', 'SELECT ''scale exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
