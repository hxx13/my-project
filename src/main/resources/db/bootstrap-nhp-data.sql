-- =============================================================
-- NHP 异种移植 CRF/EDC 数据存储与审计层建表（与 common/schema/V20260820002__nhp_data_tables.sql 同源）
-- 共 13 张表：研究对象/访视实例/表单实例/EAV值/多选值/审计/签名/质疑/ID规则/序列/DAG/DAG用户/表单授权。
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 说明：EAV（crf_record_value）为权威存储，物化宽表为冻结后可重建投影（见 06）。
-- =============================================================

CREATE TABLE IF NOT EXISTS crf_subject (
    id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    study_id     BIGINT      NOT NULL COMMENT 'FK→crf_study.id',
    subject_type VARCHAR(16) NOT NULL COMMENT 'DONOR/RECIPIENT（供体猪/受体NHP）',
    subject_code VARCHAR(64) NOT NULL COMMENT 'DON-XXX / RCP-XXX（04 编码规则生成）',
    center_id    BIGINT      NULL COMMENT 'FK→crf_center.id（采集中心）',
    dag_id       BIGINT      NULL COMMENT 'FK→crf_dag.id（数据访问组，隔离）',
    basic_json   TEXT        NULL COMMENT '基础资料 JSON（性别/出生日期等，冻结后实体化到宽表）',
    status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/RETIRED',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_subject_code (subject_code),
    KEY idx_crf_subject_study (study_id), KEY idx_crf_subject_center (center_id), KEY idx_crf_subject_dag (dag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP研究对象（供体/受体，非账号）';

CREATE TABLE IF NOT EXISTS crf_visit_instance (
    id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_id   BIGINT      NOT NULL COMMENT 'FK→crf_subject.id',
    visit_id     BIGINT      NOT NULL COMMENT 'FK→crf_visit.id（TP 定义）',
    planned_date DATE        NULL COMMENT '计划日期',
    actual_date  DATE        NULL COMMENT '实际日期',
    status       VARCHAR(20) NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED/STARTED/COMPLETED/SKIPPED',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_crf_vi_subject (subject_id), KEY idx_crf_vi_visit (visit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP访视实例（实际发生的访视，非时点定义）';

CREATE TABLE IF NOT EXISTS crf_record (
    id                BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_id        BIGINT      NOT NULL COMMENT 'FK→crf_subject.id',
    form_id           BIGINT      NOT NULL COMMENT 'FK→crf_form.id（填的哪个 CRF 表单）',
    form_version_id   BIGINT      NULL COMMENT '表单版本（血缘）',
    visit_instance_id BIGINT      NULL COMMENT 'FK→crf_visit_instance.id（可空，跨访视表单）',
    status            VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/COMPLETE/LOCKED（锁定=冻结后不可改）',
    dag_id            BIGINT      NULL COMMENT '数据访问组（冗余，加速隔离过滤）',
    created_by        VARCHAR(64) NULL,
    created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by        VARCHAR(64) NULL,
    updated_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_crf_record_subject (subject_id), KEY idx_crf_record_form (form_id),
    KEY idx_crf_record_vi (visit_instance_id), KEY idx_crf_record_dag (dag_id), KEY idx_crf_record_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP表单实例（一次填写）';

CREATE TABLE IF NOT EXISTS crf_record_value (
    id               BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_id        BIGINT        NOT NULL COMMENT 'FK→crf_record.id',
    field_id         BIGINT        NOT NULL COMMENT 'FK→crf_field.id',
    field_version_id BIGINT        NULL COMMENT '字段版本（血缘关键）',
    value_string     VARCHAR(512)  NULL COMMENT 'STRING 值',
    value_text       TEXT          NULL COMMENT 'TEXT 值',
    value_int        INT           NULL COMMENT 'INTEGER 值',
    value_decimal    DECIMAL(18,4) NULL COMMENT 'DECIMAL 值（统一精度 18,4）',
    value_date       DATE          NULL COMMENT 'DATE 值',
    value_datetime   DATETIME      NULL COMMENT 'DATETIME 值',
    value_bool       TINYINT       NULL COMMENT 'BOOLEAN 值 0/1',
    codelist_item_id BIGINT        NULL COMMENT 'FK→crf_codelist_item.id（枚举存 item 不存 label）',
    value_file_id    BIGINT        NULL COMMENT 'FK→upload_file_record.id（FILE）',
    value_json       TEXT          NULL COMMENT '兜底 JSON（复杂结构，慎用）',
    entry_mode       VARCHAR(20)   NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL/IMPORT/PAPER（value 层录入路径，见 20 对齐项）',
    entry_pass       TINYINT       NOT NULL DEFAULT 1 COMMENT '1=一录 2=二录（双录入）',
    source_ref       VARCHAR(64)   NULL COMMENT '来源引用：导入批次 ID 或源文件 ID（落在 value 不落审计表）',
    collected_at     DATETIME      NULL COMMENT '采集时间（≠录入时间，ALCOA+ Contemporaneous）',
    created_by       VARCHAR(64)   NULL,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by       VARCHAR(64)   NULL,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_rv_record_field_pass (record_id, field_id, entry_pass),
    KEY idx_crf_rv_record (record_id), KEY idx_crf_rv_field (field_id),
    KEY idx_crf_rv_codelist (codelist_item_id), KEY idx_crf_rv_file (value_file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP字段值（EAV 权威存储，按 data_type 只用其一列）';

CREATE TABLE IF NOT EXISTS crf_record_value_item (
    id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_value_id BIGINT NOT NULL COMMENT 'FK→crf_record_value.id',
    codelist_item_id BIGINT NOT NULL COMMENT '选中的码表项（ENUM_MULTI）',
    UNIQUE KEY uk_crf_rvi_value_item (record_value_id, codelist_item_id),
    KEY idx_crf_rvi_item (codelist_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP多选枚举值项（ENUM_MULTI 落地）';

CREATE TABLE IF NOT EXISTS crf_data_audit_log (
    id               BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_id        BIGINT      NOT NULL COMMENT 'FK→crf_record.id',
    field_id         BIGINT      NOT NULL COMMENT 'FK→crf_field.id',
    field_version_id BIGINT      NULL COMMENT '字段版本',
    change_type      VARCHAR(16) NOT NULL COMMENT 'INSERT/UPDATE/DELETE',
    before_value     TEXT        NULL COMMENT '变更前值',
    after_value      TEXT        NULL COMMENT '变更后值',
    operator_id      VARCHAR(64) NULL COMMENT 'FK→personnel.id（谁）',
    change_reason    VARCHAR(32) NULL COMMENT '录入/修正/query回复/导入/校验触发/复核',
    signature_id     BIGINT      NULL COMMENT 'FK→crf_signature.id（关联签名）',
    created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_audit_record (record_id, created_at), KEY idx_crf_audit_field (field_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP数据审计（每笔值变更 before/after，只追加）';

CREATE TABLE IF NOT EXISTS crf_signature (
    id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_id      BIGINT       NOT NULL COMMENT 'FK→crf_record.id（签的是哪份记录）',
    signer_id      VARCHAR(64)  NOT NULL COMMENT '签署人 personnel.id',
    signer_role    VARCHAR(32)  NULL COMMENT 'PI/兽医/数据管理员',
    meaning        VARCHAR(32)  NULL COMMENT '录入人/复核人/监察员',
    signature_hash VARCHAR(128) NULL COMMENT '签名摘要（防篡改）',
    signed_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_sign_record (record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP电子签名';

CREATE TABLE IF NOT EXISTS crf_query (
    id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_id   BIGINT      NOT NULL COMMENT 'FK→crf_record.id',
    field_id    BIGINT      NULL COMMENT 'FK→crf_field.id（质疑定位）',
    query_text  TEXT        NOT NULL COMMENT '质疑内容',
    status      VARCHAR(20) NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN/ANSWERED/CLOSED',
    opened_by   VARCHAR(64) NULL COMMENT '发起人',
    opened_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answered_by VARCHAR(64) NULL COMMENT '回复人',
    answered_at DATETIME    NULL,
    answer_text TEXT        NULL COMMENT '回复内容',
    KEY idx_crf_query_record (record_id), KEY idx_crf_query_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP数据质疑';

CREATE TABLE IF NOT EXISTS crf_id_rule (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_type     VARCHAR(16)  NOT NULL COMMENT 'DON/RCP/XM/TX/FU/AE/REG/MED/LVL/ANES/PATH/HX/PERF/SMP/TST/RS（16 类）',
    pattern     VARCHAR(128) NOT NULL COMMENT '编码格式，如 DON-{center}{year}-{seq:4}',
    center_code VARCHAR(16)  NULL COMMENT '归属中心（NULL=全局）',
    active      TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_idrule_type_center (id_type, center_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP ID 编码规则（配置，16 类对齐 04）';

CREATE TABLE IF NOT EXISTS crf_sequence (
    id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    id_type     VARCHAR(16) NOT NULL COMMENT 'ID 类型',
    center_code VARCHAR(16) NOT NULL DEFAULT '' COMMENT '中心码（全局用空串）',
    year        INT         NOT NULL COMMENT '年份',
    next_value  INT         NOT NULL DEFAULT 1 COMMENT '当前序号（原子递增）',
    updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_seq_type_center_year (id_type, center_code, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP序列（并发唯一取号，原子递增）';

CREATE TABLE IF NOT EXISTS crf_dag (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(16) NOT NULL COMMENT '数据访问组码 SJ/SH/RJ/XH/HS',
    study_id   BIGINT      NOT NULL COMMENT 'FK→crf_study.id',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_dag_code_study (code, study_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP数据访问组（多中心隔离）';

CREATE TABLE IF NOT EXISTS crf_dag_user (
    id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dag_id       BIGINT      NOT NULL COMMENT 'FK→crf_dag.id',
    personnel_id VARCHAR(64) NOT NULL COMMENT 'FK→personnel.id',
    UNIQUE KEY uk_crf_daguser (dag_id, personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP数据访问组成员';

CREATE TABLE IF NOT EXISTS crf_form_role (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    role_key   VARCHAR(64) NOT NULL COMMENT 'person_identity_tag.code 或 RoleEnum.code',
    form_id    BIGINT      NULL COMMENT 'FK→crf_form.id（NULL=全表单默认授权）',
    capability VARCHAR(32) NOT NULL COMMENT 'crf:entry/crf:verify/crf:freeze/crf:query/crf:export',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_formrole_role (role_key), KEY idx_crf_formrole_form (form_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP表单级授权矩阵（角色×表单×capability）';

-- 表单实例快照（对齐 AUP aup_snapshot；与 common/schema/V20260821008__crf_record_snapshot.sql 同源）
CREATE TABLE IF NOT EXISTS crf_record_snapshot (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_id    BIGINT       NOT NULL COMMENT 'FK→crf_record.id',
    version_no   INT          NOT NULL COMMENT '快照序号（同 record 单调递增）',
    stage        VARCHAR(32)  NOT NULL COMMENT '快照时记录状态：DRAFT/COMPLETE/LOCKED',
    biz_stage    VARCHAR(32)  NULL COMMENT '采集业务阶段：donor/recipient/…/lock',
    data_json    LONGTEXT     NOT NULL COMMENT '字段值 JSON（fieldCode→value，不可变）',
    form_id      BIGINT       NULL COMMENT '表单模板 id（血缘）',
    note         VARCHAR(256) NULL COMMENT '备注（手动快照/锁定归档等）',
    created_by   VARCHAR(64)  NULL COMMENT '创建人 personnel.id',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_snap_record_ver (record_id, version_no),
    KEY idx_crf_snap_record (record_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='NHP CRF 记录快照（阶段/锁定不可变副本）';
