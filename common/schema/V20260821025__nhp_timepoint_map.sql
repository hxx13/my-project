-- NHP timepoint 归一化（归档；运行时由 bootstrap-nhp-timepoint-map.sql 幂等执行）
-- V20260821025：crf_visit 加 event_anchor；新建 crf_timepoint_map（65 原始值 → 事件锚点×频次×TP码）

ALTER TABLE crf_visit
    ADD COLUMN IF NOT EXISTS event_anchor VARCHAR(32) NULL COMMENT '事件锚点 ENROLL/PRE_TX/DAY0/POST_TX/INTRAOP/ANES/PERFUSION/HARVEST/SAMPLE/READOUT/REGIMEN/STORAGE/EVENT/ENDPOINT/LOCK/ALL' AFTER late_days;

-- 存量 TP 码回填事件锚点（兼容 TP-01 与 TP01）
UPDATE crf_visit SET event_anchor = 'PRE_TX'   WHERE code IN ('TP-01','TP01','TP-02','TP02') AND (event_anchor IS NULL OR event_anchor = '');
UPDATE crf_visit SET event_anchor = 'DAY0'     WHERE code IN ('TP-03','TP03') AND (event_anchor IS NULL OR event_anchor = '');
UPDATE crf_visit SET event_anchor = 'POST_TX'  WHERE code IN ('TP-04','TP04','TP-05','TP05','TP-06','TP06','TP-07','TP07','TP-08','TP08','TP-09','TP09') AND (event_anchor IS NULL OR event_anchor = '');
UPDATE crf_visit SET event_anchor = 'EVENT'    WHERE code IN ('TP-10','TP10') AND (event_anchor IS NULL OR event_anchor = '');
UPDATE crf_visit SET event_anchor = 'ENDPOINT' WHERE code IN ('TP-11','TP11') AND (event_anchor IS NULL OR event_anchor = '');
UPDATE crf_visit SET event_anchor = 'LOCK'     WHERE code IN ('TP-12','TP12') AND (event_anchor IS NULL OR event_anchor = '');

CREATE TABLE IF NOT EXISTS crf_timepoint_map (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    raw_value    VARCHAR(64)  NOT NULL COMMENT '字典原始 timepoint 文本',
    event_anchor VARCHAR(32)  NOT NULL COMMENT '事件锚点',
    frequency    VARCHAR(32)  NOT NULL COMMENT '频次 ONCE/PER_TP/…',
    tp_code      VARCHAR(16)  NULL COMMENT '标准 TP 码 TP01~TP12（无横线）',
    domain       VARCHAR(8)   NOT NULL COMMENT '数据域 D1~D10',
    UNIQUE KEY uk_crf_tp_map_raw_domain (raw_value, domain),
    KEY idx_crf_tp_map_anchor (event_anchor),
    KEY idx_crf_tp_map_tp (tp_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='NHP时点归一化映射（原始值→事件锚点×频次×TP码）';
