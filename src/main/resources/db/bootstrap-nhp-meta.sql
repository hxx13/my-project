-- =============================================================
-- NHP 异种移植 CRF/EDC 字段字典元数据层建表（与 common/schema/V20260820001__nhp_meta_tables.sql 同源）
-- 共 15 张表：研究/中心/表单/章节/字段/字段引用/码表/码表项/字典联动/访视/校验规则/分层参考范围/字典变更审计/模板章节/模板字段。
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 说明：字段字典层（crf_field 等）与表单模板呈现层（crf_template_section/crf_template_field）两层分离，见档案 05/12。
-- =============================================================

CREATE TABLE IF NOT EXISTS crf_study (
    id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code             VARCHAR(64)  NOT NULL COMMENT '研究唯一标识，如 NHP-XENO（多研究/多方案隔离）',
    name             VARCHAR(128) NOT NULL COMMENT '研究名称',
    protocol_version VARCHAR(32)  NULL COMMENT '方案版本号',
    active           TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_study_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP研究项目/方案（多研究隔离）';

CREATE TABLE IF NOT EXISTS crf_center (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(16)  NOT NULL COMMENT '中心/机构码，SJ/SH/RJ/XH/HS（跨中心扩展）',
    name       VARCHAR(128) NOT NULL COMMENT '中心名称',
    active     TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_center_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP中心/机构（跨中心扩展）';

CREATE TABLE IF NOT EXISTS crf_form (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    study_id      BIGINT       NOT NULL COMMENT 'FK→crf_study.id',
    code          VARCHAR(16)  NOT NULL COMMENT '表单=数据域 D1~D10（或器官模块）',
    name          VARCHAR(128) NOT NULL COMMENT '表单名称，如 供体猪域',
    form_type     VARCHAR(16)  NOT NULL DEFAULT 'DOMAIN' COMMENT 'DOMAIN/MODULE=原子模板；TEMPLATE=组合模板（可建实例）；PUBLIC 保留',
    version       INT          NOT NULL DEFAULT 1 COMMENT '版本号，冻结递增',
    status        VARCHAR(20)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/FREEZING/FROZEN（冻结=表单级，见 06）',
    description   VARCHAR(512) NULL,
    active        TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    active_version INT          GENERATED ALWAYS AS (CASE WHEN active = 1 THEN version ELSE NULL END) VIRTUAL COMMENT '活跃版号（生成列，5.7 兼容替代函数索引）',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_form_study_code_active_ver (study_id, code, active_version),
    KEY idx_crf_form_study (study_id), KEY idx_crf_form_code (code), KEY idx_crf_form_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP表单：原子模板(DOMAIN/MODULE)或组合模板(TEMPLATE)，含版本与冻结';

CREATE TABLE IF NOT EXISTS crf_section (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    form_id     BIGINT       NOT NULL COMMENT 'FK→crf_form.id',
    code        VARCHAR(16)  NOT NULL COMMENT '子模块标识 D1.01',
    name        VARCHAR(128) NOT NULL COMMENT '子模块名称，如 个体档案',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序',
    description VARCHAR(512) NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_section_form_code (form_id, code),
    KEY idx_crf_section_form (form_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP子模块（域内 D1.01 分组）';

CREATE TABLE IF NOT EXISTS crf_field (
    id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    field_code       VARCHAR(32)  NOT NULL COMMENT '字段字典追溯码 D1.02.003（人读，不落物理列）',
    name_en          VARCHAR(64)  NOT NULL COMMENT '字段英文名=DB列名 snake_case，如 donor_id',
    name_cn          VARCHAR(128) NOT NULL COMMENT '字段中文名',
    data_type        VARCHAR(32)  NOT NULL COMMENT 'STRING/TEXT/INTEGER/DECIMAL/DATE/DATETIME/BOOLEAN/ENUM/ENUM_MULTI/CALC/FILE',
    unit             VARCHAR(32)  NULL COMMENT '单位，如 mg/kg',
    required         VARCHAR(16)  NOT NULL DEFAULT 'NO' COMMENT 'YES/NO/CONDITIONAL（条件必填在 description 写触发条件）',
    codelist_id      BIGINT       NULL COMMENT 'FK→crf_codelist.id（枚举字段）',
    description      TEXT         NULL COMMENT '说明（含条件必填触发条件）',
    calc_expression  TEXT         NULL COMMENT 'CALC 字段表达式（版本化，读取/导出时计算，见 06-九）',
    cdisc_domain     VARCHAR(8)   NULL COMMENT 'SEND 域，如 DM/VS/LB/EX（无映射留空）',
    cdisc_variable   VARCHAR(8)   NULL COMMENT 'SEND 变量，如 USUBJID/VSTESTCD',
    cdisc_test_code  VARCHAR(40)  NULL COMMENT '检验/生命体征 test code，如 CREAT/WEIGHT',
    status           VARCHAR(20)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PENDING_REVIEW/FROZEN/RETIRED（冻结前校对进度）',
    version          INT          NOT NULL DEFAULT 1 COMMENT '版本号，随冻结递增',
    frozen_at        DATETIME     NULL COMMENT '冻结时间',
    frozen_by        VARCHAR(64)  NULL COMMENT '冻结人',
    active           TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_field_code (field_code),
    KEY idx_crf_field_name_en (name_en),
    KEY idx_crf_field_codelist (codelist_id), KEY idx_crf_field_status (status), KEY idx_crf_field_type (data_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP字段定义（ItemDef，含版本+冻结+CDISC映射）';

CREATE TABLE IF NOT EXISTS crf_form_field (
    id                BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    form_id           BIGINT      NOT NULL COMMENT 'FK→crf_form.id（所在表单 D1/D3/D10）',
    field_id          BIGINT      NOT NULL COMMENT 'FK→crf_field.id（引用的字段定义）',
    role              VARCHAR(16) NOT NULL DEFAULT 'VALUE' COMMENT 'PK/FK/VALUE/DERIVED（主键/外键/采集值/派生）',
    position          INT         NOT NULL DEFAULT 0 COMMENT '表单内顺序',
    required_override VARCHAR(16) NULL COMMENT '覆盖该表单内必填（NULL=沿用字段默认）',
    logic_ref         TEXT        NULL COMMENT '分支/显隐逻辑引用',
    created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_form_field (form_id, field_id),
    KEY idx_crf_ff_field (field_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP表单-字段引用（ItemRef，位置/必填/角色）';

CREATE TABLE IF NOT EXISTS crf_codelist (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code       VARCHAR(32)  NOT NULL COMMENT '码表编码 BREED/EDIT/FARM/ORG…',
    name       VARCHAR(128) NOT NULL COMMENT '码表名',
    version    INT          NOT NULL DEFAULT 1 COMMENT '码表版本（整表版本）',
    status     VARCHAR(20)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/FROZEN/ARCHIVED/RETIRED（变更走版本，禁止直接改冻结取值）',
    active     TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    active_version INT       GENERATED ALWAYS AS (CASE WHEN active = 1 THEN version ELSE NULL END) VIRTUAL COMMENT '活跃版号（生成列，5.7 兼容替代函数索引）',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_codelist_code_active_ver (code, active_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP码表（整表版本+冻结）';

CREATE TABLE IF NOT EXISTS crf_codelist_item (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    codelist_id BIGINT       NOT NULL COMMENT 'FK→crf_codelist.id',
    item_code   VARCHAR(64)  NOT NULL COMMENT '稳定码 SH/GTKO（改 label 不改 code）',
    item_label  VARCHAR(256) NOT NULL COMMENT '显示名',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序',
    active      TINYINT      NOT NULL DEFAULT 1 COMMENT '逐项软删 0/1',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_item_code (codelist_id, item_code),
    KEY idx_crf_item_codelist (codelist_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP码表项（采集存 item，不存 label）';

CREATE TABLE IF NOT EXISTS crf_codelist_link (
    id                BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_id           BIGINT      NOT NULL COMMENT 'FK→crf_codelist_item.id（源字典项）',
    child_codelist_id BIGINT      NOT NULL COMMENT 'FK→crf_codelist.id（指向的子字典，级联下一级）',
    sort_order        INT         NOT NULL DEFAULT 0 COMMENT '一对多时的顺序',
    created_at        DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_clink_item_child (item_id, child_codelist_id),
    KEY idx_crf_clink_item (item_id), KEY idx_crf_clink_child (child_codelist_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP字典项→子字典联动（级联，一项可指向多个子字典，纯配置）';

CREATE TABLE IF NOT EXISTS crf_visit (
    id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code         VARCHAR(16) NOT NULL COMMENT '时点码 TP-01~TP-12',
    name         VARCHAR(64) NOT NULL COMMENT '时点名，如 术前筛查期',
    seq          INT         NOT NULL DEFAULT 0 COMMENT '时点顺序',
    repeating    TINYINT     NOT NULL DEFAULT 0 COMMENT '是否重复事件（随访=1）',
    planned_days INT         NULL COMMENT '术后相对天数锚点',
    early_days   INT         NULL COMMENT '允许提前天数（非对称窗口，见 17）',
    late_days    INT         NULL COMMENT '允许延后天数（TP01 -28~-7d / TP12 +30d）',
    active       TINYINT     NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_visit_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP访视/时点定义（TP-01~TP-12，事件驱动）';

CREATE TABLE IF NOT EXISTS crf_validation_rule (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    field_id   BIGINT       NOT NULL COMMENT 'FK→crf_field.id（针对哪个字段）',
    rule_type  VARCHAR(20)  NOT NULL COMMENT 'RANGE/THRESHOLD/TIME_GAP/CROSS_FIELD/REGEX/CONDITIONAL_REQUIRED/SKIP',
    severity   VARCHAR(10)  NOT NULL DEFAULT 'WARN' COMMENT 'WARN/ERROR/FLAG（FLAG=仅标记接 query）',
    expression JSON         NULL COMMENT '结构化表达式 {type,params}（RANGE 引用 crf_reference_range）',
    message    VARCHAR(255) NULL COMMENT '触发提示文案',
    active     TINYINT      NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_rule_field (field_id), KEY idx_crf_rule_type (rule_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP字段级校验/分支规则（expression JSON {type,params}）';

CREATE TABLE IF NOT EXISTS crf_reference_range (
    id         BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    field_id   BIGINT        NOT NULL COMMENT 'FK→crf_field.id（检验字段）',
    species    VARCHAR(32)   NULL COMMENT '分层维度：种属',
    sex        VARCHAR(8)    NULL COMMENT '分层维度：性别 M/F',
    age_min    INT           NULL COMMENT '分层维度：年龄带下限',
    age_max    INT           NULL COMMENT '分层维度：年龄带上限',
    min        DECIMAL(18,4) NULL COMMENT '参考范围下限',
    max        DECIMAL(18,4) NULL COMMENT '参考范围上限',
    source     VARCHAR(128)  NULL COMMENT '参考范围来源（动物中心/实验室）',
    version    VARCHAR(32)   NULL COMMENT '参考范围版本',
    active     TINYINT       NOT NULL DEFAULT 1 COMMENT '软删 0/1',
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_refrange_field (field_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP分层参考范围（血肌酐等按种属/性别/年龄分层）';

CREATE TABLE IF NOT EXISTS crf_dict_change_log (
    id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entity      VARCHAR(20) NOT NULL COMMENT 'field/codelist/form',
    entity_id   BIGINT      NOT NULL COMMENT '实体 id',
    change_type VARCHAR(32) NOT NULL COMMENT 'CREATE/UPDATE/FREEZE/RETIRE/…',
    before_json TEXT        NULL COMMENT '变更前 JSON',
    after_json  TEXT        NULL COMMENT '变更后 JSON',
    operator    VARCHAR(64) NULL COMMENT '操作人',
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_dictlog_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP字段字典变更审计（ALCOA+，只追加）';

CREATE TABLE IF NOT EXISTS crf_template_section (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    form_id     BIGINT       NOT NULL COMMENT 'FK→crf_form.id（所属模板）',
    parent_id   BIGINT       NULL COMMENT 'FK→crf_template_section.id（NULL=Section 数据域 D1，非空=SubSection D1.01）',
    code        VARCHAR(16)  NOT NULL COMMENT '段/小节标识 D1 或 D1.01',
    label       VARCHAR(128) NOT NULL COMMENT '显示名',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序',
    subdivisible TINYINT     NOT NULL DEFAULT 0 COMMENT '是否细分小章节 0/1',
    show_when   TEXT         NULL COMMENT '条件显示 JSON {field,op,value}',
    description VARCHAR(512) NULL COMMENT '说明',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_crf_tsection_form_parent_code (form_id, parent_id, code),
    KEY idx_crf_tsection_form (form_id), KEY idx_crf_tsection_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP表单模板章节（Section/SubSection，呈现层）';

CREATE TABLE IF NOT EXISTS crf_template_field (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    form_id     BIGINT       NOT NULL COMMENT 'FK→crf_form.id（所属模板）',
    section_id  BIGINT       NULL COMMENT 'FK→crf_template_section.id（归属小节，NULL=直接挂表单）',
    field_key   VARCHAR(64)  NOT NULL COMMENT '字段键 D1.01.001（引用 crf_field.field_code）',
    label       VARCHAR(128) NOT NULL COMMENT '字段显示名',
    description TEXT         NULL COMMENT '说明文字',
    type        VARCHAR(32)  NOT NULL COMMENT 'text/textarea/number/date/choice/select/checkbox/cascade/table/group/repeatGroup/file/image/signature/richText/divider/description',
    options     TEXT         NULL COMMENT '选项 JSON：[{value,label}]',
    dict_key    VARCHAR(32)  NULL COMMENT '引用码表 crf_codelist.code',
    required    TINYINT      NOT NULL DEFAULT 0 COMMENT '必填 0/1',
    show_when   TEXT         NULL COMMENT '条件显示 JSON',
    sort_order  INT          NOT NULL DEFAULT 0 COMMENT '排序',
    config      TEXT         NULL COMMENT 'maxLength/choiceType/unit/min/max/accept/columns/fields 等 JSON',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_crf_tfield_form (form_id), KEY idx_crf_tfield_section (section_id), KEY idx_crf_tfield_key (field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP表单模板字段（题型/选项/条件，呈现层）';
