-- 资格项 ↔ 报单表单/Word 模板绑定：决定某个资格项（如 health_report）由哪张表单产出、用哪份 Word 模板生成 PDF
CREATE TABLE IF NOT EXISTS qualification_item_config (
    item_key         VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '资格项 key，如 health_report',
    form_id          BIGINT       NOT NULL COMMENT 'reportform_definition.id',
    word_template_id VARCHAR(64)  NULL COMMENT 'word_template_ids_json 里的模板 id；空则取第一份',
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资格项与表单/模板绑定';
