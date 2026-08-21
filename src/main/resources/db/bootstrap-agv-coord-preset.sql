-- ============================================================
-- AGV 坐标系布局预设快照（全局单槽）
--
-- 「保存预设」归档整套布局；与 agv_coord_config 实时编辑态分离。
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：common/schema/V20260821020__agv_coord_preset.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS agv_coord_preset (
    preset_key   VARCHAR(32)  NOT NULL COMMENT '预设槽位键（目前仅 default）',
    configs_json MEDIUMTEXT   NOT NULL COMMENT '各车坐标系快照 JSON：{ip:{rotationDeg,offsetX,offsetY,scale}}',
    saved_at     DATETIME(3)  NOT NULL COMMENT '归档时间',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次创建时间',
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近更新时间',
    PRIMARY KEY (preset_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AGV坐标系布局预设快照';
