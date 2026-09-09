-- 卡牌打印：模板表 + 归档表
CREATE TABLE IF NOT EXISTS card_print_template (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  name          VARCHAR(64)  NOT NULL COMMENT '模板名',
  spec_json     JSON         NOT NULL COMMENT '尺寸引擎输入 CardSpec',
  slots_json    JSON         NOT NULL COMMENT '槽位定义 Slot[]',
  is_default    TINYINT      NOT NULL DEFAULT 0 COMMENT '默认模板',
  enabled       TINYINT      NOT NULL DEFAULT 1 COMMENT '是否启用',
  created_by    VARCHAR(64)  DEFAULT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by    VARCHAR(64)  DEFAULT NULL,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_card_print_template_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='卡牌打印模板';

CREATE TABLE IF NOT EXISTS card_print_archive (
  id                  BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  template_id         BIGINT       NOT NULL COMMENT '模板 id',
  template_name       VARCHAR(64)  NOT NULL COMMENT '模板名快照',
  spec_snapshot_json  JSON         NOT NULL COMMENT '生成时 CardSpec 快照',
  slots_snapshot_json JSON         NOT NULL COMMENT '生成时 Slot[] 快照',
  cage_ids_json       JSON         NOT NULL COMMENT '本次包含的 animalCageId 列表',
  page_count          INT          NOT NULL DEFAULT 0 COMMENT '页数',
  file_name           VARCHAR(128) NOT NULL COMMENT '下载文件名',
  stored_path         VARCHAR(512) NOT NULL COMMENT '落盘相对路径',
  file_size           BIGINT       NOT NULL DEFAULT 0 COMMENT '字节数',
  created_by          VARCHAR(64)  DEFAULT NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_card_print_archive_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='卡牌打印归档';
