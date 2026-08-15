-- =============================================================
-- IACUC AUP 模块建表（启动自动执行，与 common/schema/V20260814__aup_tables.sql 同源）
-- 共 15 张表：模板 4 + 实例 8 + 字典 2 + 授权 1。幂等：CREATE TABLE IF NOT EXISTS。
-- =============================================================

-- 组一：表单模板（可配置，每发布版本 = 一行 form_template + 其下 section/subsection/field）
CREATE TABLE IF NOT EXISTS form_template (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    form_key      VARCHAR(64)  NOT NULL COMMENT '表单唯一标识，如 aup',
    name          VARCHAR(128) NOT NULL COMMENT '模板名称',
    version       INT          NOT NULL DEFAULT 1 COMMENT '版本号（每次发布递增）',
    status        VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED；仅 PUBLISHED 对填写人生效',
    description   VARCHAR(512) NULL,
    published_at  DATETIME     NULL,
    created_by    VARCHAR(64)  NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_template_form_key_version (form_key, version),
    KEY idx_template_status (status), KEY idx_template_form_key (form_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP表单模板（含版本）';

CREATE TABLE IF NOT EXISTS form_section (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    template_id  BIGINT       NOT NULL COMMENT 'FK→form_template.id',
    code         VARCHAR(16)  NOT NULL COMMENT '板块标识 A/B/C…',
    label        VARCHAR(128) NOT NULL,
    sort_order   INT          NOT NULL DEFAULT 0 COMMENT '排序（order 为保留字）',
    subdivisible TINYINT      NOT NULL DEFAULT 0 COMMENT '是否细分小章节 0/1',
    show_when    TEXT         NULL COMMENT '条件显示 JSON {field,op,value}',
    highlight    TINYINT      NOT NULL DEFAULT 0 COMMENT '是否突出显示 0/1（前置说明等）',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_section_template_code (template_id, code), KEY idx_section_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP表单大段';

CREATE TABLE IF NOT EXISTS form_subsection (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    section_id  BIGINT       NOT NULL COMMENT 'FK→form_section.id',
    code        VARCHAR(16)  NOT NULL COMMENT 'A1/A2…',
    label       VARCHAR(128) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    description VARCHAR(512) NULL,
    show_when   TEXT         NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_subsection_section_code (section_id, code), KEY idx_subsection_section (section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP表单小章节';

CREATE TABLE IF NOT EXISTS form_field (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    section_id    BIGINT       NULL COMMENT 'FK→form_section.id；与 subsection_id 二选一',
    subsection_id BIGINT       NULL COMMENT 'FK→form_subsection.id；与 section_id 二选一',
    field_key     VARCHAR(64)  NOT NULL COMMENT 'A8.parts / B1.purpose 等',
    label         VARCHAR(128) NOT NULL,
    type          VARCHAR(32)  NOT NULL COMMENT 'text/textarea/number/date/choice/checkbox/table/group/file/signature/personPicker 等',
    options       TEXT         NULL COMMENT '选项 JSON：[{value,label}]，value=label 可简写字符串数组',
    dict_key      VARCHAR(64)  NULL COMMENT '引用 dict.dict_key',
    required      TINYINT      NOT NULL DEFAULT 0,
    show_when     TEXT         NULL,
    sort_order    INT          NOT NULL DEFAULT 0,
    config        TEXT         NULL COMMENT 'maxLength/choiceType/columns/unit/min/max/accept 等',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_field_section (section_id), KEY idx_field_subsection (subsection_id), KEY idx_field_dict (dict_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP表单字段';

-- 组二：计划书实例
CREATE TABLE IF NOT EXISTS aup_record (
    id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    template_id        BIGINT       NOT NULL COMMENT 'FK→form_template.id（发布版本=一行）',
    template_version   VARCHAR(32)  NULL COMMENT '冗余版本号',
    version            BIGINT       NOT NULL DEFAULT 0 COMMENT '乐观锁（流转/保存 CAS 用）',
    register_no        VARCHAR(64)  NULL COMMENT 'JUMC{年}-{序}[-字母]，提交时生成并锁定，unlock 不清空',
    register_year      INT          NULL COMMENT '注册号年份（冗余，支撑 年份+序号 唯一）',
    register_seq       INT          NULL COMMENT '注册号序号（每年从 1 递增）',
    current_stage      VARCHAR(32)  NOT NULL DEFAULT 'draft' COMMENT 'draft/formatReview/expertReview/approved/terminated/expired（唯一状态字段）',
    round_no           INT          NOT NULL DEFAULT 1 COMMENT '第几轮（≥1）',
    draft_source       VARCHAR(32)  NOT NULL DEFAULT 'first' COMMENT 'first/piReturn/formatReturn/expertReturn',
    review_form        VARCHAR(16)  NULL COMMENT '专家审查形式 member/meeting',
    origin_register_no VARCHAR(64)  NULL COMMENT '更新项目填的原注册号',
    carried_over_count INT          NOT NULL DEFAULT 0 COMMENT '结转未使用动物数',
    expire_at          DATETIME     NULL COMMENT 'approved+3年',
    project_name       VARCHAR(256) NULL COMMENT '项目名称（列表展示/搜索，冗余自 A1）',
    pi_user_id         VARCHAR(64)  NULL COMMENT '课题组长 userId（通知/待办定位）',
    pi_name            VARCHAR(128) NULL,
    dept               VARCHAR(128) NULL,
    project_source     VARCHAR(64)  NULL,
    project_group_name VARCHAR(128) NULL COMMENT '课题组名称（冗余自 aro_personnel.project_group_name，供学生端按课题组查看）',
    submitted_at       DATETIME     NULL,
    approved_at        DATETIME     NULL,
    created_by         VARCHAR(64)  NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_register_no (register_no),
    UNIQUE KEY uk_register_year_seq (register_year, register_seq),
    KEY idx_aup_stage_round (current_stage, round_no),
    KEY idx_aup_created_by (created_by), KEY idx_aup_created_at (created_at), KEY idx_aup_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP计划书主记录';

CREATE TABLE IF NOT EXISTS aup_data (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    aup_id     BIGINT      NOT NULL COMMENT 'FK→aup_record.id',
    data       MEDIUMTEXT  NULL COMMENT '当前草稿 JSON（整表填报内容）',
    version    BIGINT      NOT NULL DEFAULT 0 COMMENT '乐观锁（草稿保存 CAS 用）',
    updated_by VARCHAR(64) NULL,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_data_aup (aup_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP当前草稿数据（1:1）';

CREATE TABLE IF NOT EXISTS aup_snapshot (
    id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    aup_id           BIGINT       NOT NULL COMMENT 'FK→aup_record.id',
    version_no       INT          NOT NULL COMMENT '快照序号（全计划单调递增）',
    stage            VARCHAR(32)  NOT NULL COMMENT '该快照所处 stage',
    data             MEDIUMTEXT   NULL COMMENT '快照 JSON（不可变）',
    template_id      BIGINT       NULL,
    template_version VARCHAR(32)  NULL,
    created_by       VARCHAR(64)  NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_snapshot_aup_ver (aup_id, version_no), KEY idx_snapshot_aup (aup_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP每阶段不可变快照（mapper 只 insert/select）';

CREATE TABLE IF NOT EXISTS aup_audit_log (
    id         BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    aup_id     BIGINT        NOT NULL COMMENT 'FK→aup_record.id',
    actor      VARCHAR(64)   NULL,
    role       VARCHAR(32)   NULL COMMENT 'lab/PI/secretary/expert/admin',
    action     VARCHAR(32)   NOT NULL COMMENT 'submit/pass/return/assignExpert/terminate/approve/expire/rollback/upload/delFile 等',
    from_stage VARCHAR(32)   NULL,
    to_stage   VARCHAR(32)   NULL,
    comment    VARCHAR(1000) NULL,
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_aup_time (aup_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP留痕/审计（只追加，mapper 只 insert/select，禁 update/delete）';

CREATE TABLE IF NOT EXISTS aup_review_assignment (
    id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    aup_id      BIGINT      NOT NULL COMMENT 'FK→aup_record.id',
    round_no    INT         NOT NULL COMMENT '审查轮次',
    reviewer_id VARCHAR(64) NOT NULL COMMENT '被分配专家',
    status      VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/voted/recused',
    assigned_by VARCHAR(64) NULL COMMENT '分配人（格式审查人）',
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_assign_aup_round_reviewer (aup_id, round_no, reviewer_id),
    KEY idx_assign_reviewer (reviewer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP专家分配记录（todo 与分母计算依据）';

CREATE TABLE IF NOT EXISTS aup_review (
    id         BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    aup_id     BIGINT        NOT NULL COMMENT 'FK→aup_record.id',
    round_no   INT           NOT NULL COMMENT '审查轮次（幂等）',
    reviewer   VARCHAR(64)   NULL,
    role       VARCHAR(32)   NULL COMMENT 'expert（专家投票）',
    verdict    VARCHAR(16)   NOT NULL COMMENT 'agree/disagree/modify/recuse/abstain（同意/不同意/修改/回避/拒评）',
    comment    VARCHAR(1000) NULL COMMENT '整体审核反馈',
    created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_review_aup_reviewer_round (aup_id, reviewer, round_no),
    KEY idx_review_aup (aup_id), KEY idx_review_reviewer (reviewer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP专家审查投票记录（会议人数由此聚合）';

CREATE TABLE IF NOT EXISTS aup_review_item (
    id          BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
    review_id   BIGINT        NOT NULL COMMENT 'FK→aup_review.id',
    aup_id      BIGINT        NOT NULL COMMENT 'FK→aup_record.id（冗余，总览查询）',
    round_no    INT           NOT NULL COMMENT '审查轮次',
    field_key   VARCHAR(64)   NOT NULL COMMENT '字段键 A1.projectName / B1.purpose',
    section_key VARCHAR(16)   NOT NULL COMMENT '所属大段 A/B/C…（总览分组）',
    field_label VARCHAR(128)  NOT NULL COMMENT '字段名快照（展示，不依赖模板）',
    verdict     VARCHAR(16)   NOT NULL COMMENT 'compliant/nonCompliant/suggest（合规/不合规/建议修改）',
    reason      VARCHAR(1000) NULL COMMENT '理由（nonCompliant 必填）',
    suggestion  VARCHAR(1000) NULL COMMENT '修改建议',
    reviewer    VARCHAR(64)   NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_item_review_field (review_id, field_key),
    KEY idx_item_aup_round (aup_id, round_no),
    KEY idx_item_field (aup_id, field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP逐字段评审意见（评审填写 + 返修查看，快捷入口/总览数据源）';

CREATE TABLE IF NOT EXISTS aup_attachment (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    aup_id     BIGINT       NOT NULL COMMENT 'FK→aup_record.id',
    file_id    BIGINT       NOT NULL COMMENT 'FK→upload_file_record.id',
    file_name  VARCHAR(255) NULL,
    created_by VARCHAR(64)  NULL,
    deleted    TINYINT      NOT NULL DEFAULT 0 COMMENT '软删；删除/替换走 aup_audit_log',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_attach_aup (aup_id), KEY idx_attach_file (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP附件关联（≤10个/计划，快照仅引用 file_id）';

-- 组三：字典
CREATE TABLE IF NOT EXISTS dict (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dict_key   VARCHAR(64)  NOT NULL COMMENT '如 animalSpecies',
    name       VARCHAR(128) NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dict_key (dict_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP公共字典';

CREATE TABLE IF NOT EXISTS dict_item (
    id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dict_id    BIGINT       NOT NULL COMMENT 'FK→dict.id',
    value      VARCHAR(128) NOT NULL COMMENT '落库值',
    label      VARCHAR(256) NOT NULL COMMENT '展示文本',
    sort_order INT          NOT NULL DEFAULT 0,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_dict_item_value (dict_id, value), KEY idx_dict_item_dict (dict_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP字典项';

-- 组四：授权（IACUC 秘书/专家名册，替代缺失的 RoleEnum 角色）
CREATE TABLE IF NOT EXISTS aup_reviewer (
    id            BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id       VARCHAR(64) NOT NULL COMMENT '用户ID',
    reviewer_role VARCHAR(16) NOT NULL COMMENT 'secretary/expert',
    scope         VARCHAR(64) NULL COMMENT '可审范围（全校/某课题组），NULL=全校',
    enabled       TINYINT     NOT NULL DEFAULT 1,
    created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_reviewer_user_role (user_id, reviewer_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AUP审查人名册（格式审查人/专家）';
