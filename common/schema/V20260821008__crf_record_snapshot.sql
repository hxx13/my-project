-- NHP CRF 表单实例快照（对齐 AUP aup_snapshot：不可变，只 insert/select）
-- 用于填写页右侧「历史快照」与状态流转留痕（COMPLETE / LOCKED）。

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
