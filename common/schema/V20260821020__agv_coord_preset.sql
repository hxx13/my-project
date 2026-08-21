-- ============================================================
-- AGV 坐标系布局预设快照（全局单槽）
--
-- 背景：「保存预设 / 恢复预设」此前只写浏览器
-- localStorage["agvCoordPreset"]，换机器/清缓存后丢失。
-- 本表把整套布局（各车 rotation/offset/scale）归档为服务端快照，
-- 与 agv_coord_config 上的实时编辑态分离：
--   · agv_coord_config = 当前生效的实时配置（自动保存仍写这里）
--   · agv_coord_preset = 用户显式「保存预设」的可恢复归档
--
-- preset_key 目前仅使用 'default' 单槽；覆盖保存即 upsert。
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：src/main/resources/db/bootstrap-agv-coord-preset.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS agv_coord_preset (
    preset_key   VARCHAR(32)  NOT NULL COMMENT '预设槽位键（目前仅 default）',
    configs_json MEDIUMTEXT   NOT NULL COMMENT '各车坐标系快照 JSON：{ip:{rotationDeg,offsetX,offsetY,scale}}',
    saved_at     DATETIME(3)  NOT NULL COMMENT '归档时间',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次创建时间',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近更新时间',
    PRIMARY KEY (preset_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AGV坐标系布局预设快照';
