-- 卡牌打印字段值映射（通用原值 → 渲染简称）归档迁移
-- 与 src/main/resources/db/bootstrap-card-print-value-map.sql 保持一致（幂等）

CREATE TABLE IF NOT EXISTS card_print_value_map (
  id          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  canonical   VARCHAR(64)  NOT NULL COMMENT '字段 canonical（如 animal_come_from）',
  raw_value   VARCHAR(255) NOT NULL COMMENT '原值',
  short_value VARCHAR(64)  NOT NULL COMMENT '渲染用简称',
  sort        INT          NOT NULL DEFAULT 0 COMMENT '排序',
  created_by  VARCHAR(64)  DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_card_print_value_map (canonical, raw_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='卡牌打印字段值映射';
