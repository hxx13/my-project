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

INSERT INTO card_print_template (name, spec_json, slots_json, is_default, enabled, created_by)
VALUES (
  '标准笼位卡 70×105',
  '{"pageWidthMm":70,"pageHeightMm":105,"marginMm":2,"defaultFontSizePt":9,"lineHeightMm":null,"offsetXMm":0,"offsetYMm":0,"borderWidthMm":0.2,"borderColor":"#000000","qr":{"enabled":false,"fieldKey":"__qr__","sizeMm":33,"marginMm":1,"anchor":"top-right"},"landscape":false,"rotate90":false,"table":null}',
  '[{"cells":[{"label":"PI: ","fieldKey":"project_pi_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"实验人员: ","fieldKey":"experimenter_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"项目: ","fieldKey":"project_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"部门: ","fieldKey":"department_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"AUP: ","fieldKey":"aup_number","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"品系: ","fieldKey":"animal_strain_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"周龄: ","fieldKey":"animal_week_age"},{"label":"性别: ","fieldKey":"animal_sex"}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"公: ","fieldKey":"animal_male_number"},{"label":"母: ","fieldKey":"animal_female_number"}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"来源: ","fieldKey":"animal_come_from","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"位置: ","fieldKey":"__position__","colSpan":2}],"align":"left","bold":true,"fontSizePt":null}]',
  1, 1, 'system'
)
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO card_print_template (name, spec_json, slots_json, is_default, enabled, created_by)
VALUES (
  '纯二维码卡 70×105',
  '{"pageWidthMm":70,"pageHeightMm":105,"marginMm":2,"defaultFontSizePt":9,"lineHeightMm":null,"offsetXMm":0,"offsetYMm":0,"borderWidthMm":0.2,"borderColor":"#000000","qr":{"enabled":true,"fieldKey":"__qr__","sizeMm":45,"marginMm":1,"anchor":"middle-center"},"landscape":false,"rotate90":false,"table":{"widthMm":null,"heightMm":12,"anchor":"bottom-center","colCount":null,"colWidthsMm":null}}',
  '[{"cells":[{"label":"位置: ","fieldKey":"__position__","colSpan":null}],"align":"left","bold":true,"fontSizePt":null}]',
  0, 1, 'system'
)
ON DUPLICATE KEY UPDATE name = name;

-- 清理历史编码错乱产生的种子行（JVM 默认字符集非 UTF-8 时读脚本会写入乱码名称）
DELETE FROM card_print_template
WHERE created_by = 'system' AND name NOT IN ('标准笼位卡 70×105', '纯二维码卡 70×105');

-- 标准笼位卡不再带二维码（仅对从未被编辑过的系统种子行生效）
UPDATE card_print_template
SET spec_json = JSON_SET(spec_json, '$.qr.enabled', CAST('false' AS JSON))
WHERE created_by = 'system' AND name = '标准笼位卡 70×105'
  AND updated_at = created_at
  AND JSON_EXTRACT(spec_json, '$.qr.enabled') = TRUE;

-- 槽位模型升级为 cells（N 列）：只对仍是旧格式（无 cells 键）的种子行生效，迁移一次后自然失效
UPDATE card_print_template
SET slots_json = '[{"cells":[{"label":"PI: ","fieldKey":"project_pi_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"实验人员: ","fieldKey":"experimenter_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"项目: ","fieldKey":"project_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"部门: ","fieldKey":"department_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"AUP: ","fieldKey":"aup_number","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"品系: ","fieldKey":"animal_strain_name","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"周龄: ","fieldKey":"animal_week_age"},{"label":"性别: ","fieldKey":"animal_sex"}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"公: ","fieldKey":"animal_male_number"},{"label":"母: ","fieldKey":"animal_female_number"}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"来源: ","fieldKey":"animal_come_from","colSpan":2}],"align":"left","bold":true,"fontSizePt":null},{"cells":[{"label":"位置: ","fieldKey":"__position__","colSpan":2}],"align":"left","bold":true,"fontSizePt":null}]'
WHERE created_by = 'system' AND name = '标准笼位卡 70×105'
  AND JSON_EXTRACT(slots_json, '$[0].cells') IS NULL;

-- 纯二维码卡加「位置」一列：二维码缩到 45mm 居中，底部留 12mm 放位置文本
UPDATE card_print_template
SET spec_json = '{"pageWidthMm":70,"pageHeightMm":105,"marginMm":2,"defaultFontSizePt":9,"lineHeightMm":null,"offsetXMm":0,"offsetYMm":0,"borderWidthMm":0.2,"borderColor":"#000000","qr":{"enabled":true,"fieldKey":"__qr__","sizeMm":45,"marginMm":1,"anchor":"middle-center"},"landscape":false,"rotate90":false,"table":{"widthMm":null,"heightMm":12,"anchor":"bottom-center","colCount":null,"colWidthsMm":null}}',
    slots_json = '[{"cells":[{"label":"位置: ","fieldKey":"__position__","colSpan":null}],"align":"left","bold":true,"fontSizePt":null}]'
WHERE created_by = 'system' AND name = '纯二维码卡 70×105'
  AND JSON_EXTRACT(slots_json, '$[0].cells') IS NULL;
