-- 健康调查表答卷（在线填写，替代原 XFA 表单；不生成 PDF，直接存结构化数据）
CREATE TABLE IF NOT EXISTS health_survey_response (
    person_id    VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '账号 id，与 person_qualification.person_id 同源',
    data_json    LONGTEXT    NOT NULL COMMENT '答卷 JSON（字段 key → 值）',
    submitted_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='健康调查表答卷';
