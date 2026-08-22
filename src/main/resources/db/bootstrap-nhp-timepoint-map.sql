-- ============================================================
-- NHP timepoint 归一化（对齐 22 §2.1 / V20260821025）
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 启动幂等执行。
-- 同源：common/schema/V20260821025__nhp_timepoint_map.sql
-- ============================================================

SET @db := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'crf_visit' AND COLUMN_NAME = 'event_anchor'
);
SET @sql = IF(@col = 0,
  'ALTER TABLE crf_visit ADD COLUMN event_anchor VARCHAR(32) NULL COMMENT ''事件锚点 ENROLL/PRE_TX/DAY0/POST_TX/INTRAOP/ANES/PERFUSION/HARVEST/SAMPLE/READOUT/REGIMEN/STORAGE/EVENT/ENDPOINT/LOCK/ALL'' AFTER late_days',
  'SELECT ''event_anchor exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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

-- seed：65 原始值归并（跳过「同上」；拆分 0h/结束 与 术前复合值）
INSERT IGNORE INTO crf_timepoint_map (raw_value, event_anchor, frequency, tp_code, domain) VALUES
('0h', 'PERFUSION', 'ONCE', NULL, 'D10'),
('结束', 'PERFUSION', 'ONCE', NULL, 'D10'),
('TP01', 'PRE_TX', 'ONCE', 'TP01', 'D2'),
('TP01', 'PRE_TX', 'ONCE', 'TP01', 'D3'),
('TP01', 'PRE_TX', 'ONCE', 'TP01', 'D9'),
('TP01/02', 'PRE_TX', 'ONCE', 'TP01', 'D2'),
('TP02', 'PRE_TX', 'ONCE', 'TP02', 'D1'),
('TP02', 'PRE_TX', 'ONCE', 'TP02', 'D2'),
('TP02', 'PRE_TX', 'ONCE', 'TP02', 'D9'),
('TP03', 'DAY0', 'ONCE', 'TP03', 'D3'),
('TP03', 'DAY0', 'ONCE', 'TP03', 'D9'),
('TP03末', 'DAY0', 'ONCE', 'TP03', 'D9'),
('TP04', 'POST_TX', 'PER_TP', 'TP04', 'D9'),
('TP04-06', 'POST_TX', 'PER_TP', 'TP04', 'D4'),
('TP04-08', 'POST_TX', 'PER_TP', 'TP04', 'D4'),
('TP04-09', 'POST_TX', 'PER_TP', 'TP04', 'D4'),
('TP04起', 'POST_TX', 'PER_TP', 'TP04', 'D9'),
('TP05/TP11', 'POST_TX', 'PER_TP', 'TP05', 'D9'),
('TP05/事件', 'EVENT', 'EVENT', 'TP05', 'D5'),
('TP10', 'EVENT', 'EVENT', 'TP10', 'D9'),
('TP11', 'ENDPOINT', 'ONCE', 'TP11', 'D5'),
('TP12', 'LOCK', 'ONCE', 'TP12', 'D5'),
('事件关闭', 'EVENT', 'ONCE', NULL, 'D5'),
('事件触发', 'EVENT', 'EVENT', 'TP10', 'D5'),
('入库', 'STORAGE', 'ONCE', NULL, 'D4'),
('入档', 'ENROLL', 'ONCE', NULL, 'D1'),
('入组', 'ENROLL', 'ONCE', NULL, 'D2'),
('全程', 'ALL', 'CONTINUOUS', NULL, 'D4'),
('全程', 'ALL', 'CONTINUOUS', NULL, 'D9'),
('取材', 'SAMPLE', 'ONCE', NULL, 'D8'),
('各时点', 'POST_TX', 'PER_TP', NULL, 'D4'),
('各时点', 'POST_TX', 'PER_TP', NULL, 'D5'),
('各时点', 'POST_TX', 'PER_TP', NULL, 'D9'),
('回传时', 'READOUT', 'ONCE', NULL, 'D4'),
('委托时', 'SAMPLE', 'ONCE', NULL, 'D4'),
('季度', 'ALL', 'QUARTERLY', NULL, 'D1'),
('年度', 'ALL', 'ANNUAL', NULL, 'D1'),
('报告签发', 'READOUT', 'ONCE', NULL, 'D8'),
('按方案', 'REGIMEN', 'PER_PROTOCOL', NULL, 'D9'),
('按血检频率', 'POST_TX', 'PER_LAB', NULL, 'D9'),
('方案变更', 'REGIMEN', 'EVENT', NULL, 'D6'),
('方案启动', 'REGIMEN', 'ONCE', NULL, 'D6'),
('术中', 'INTRAOP', 'ONCE', 'TP03', 'D7'),
('术中+维持期', 'INTRAOP', 'CONTINUOUS', NULL, 'D9'),
('术中/术毕', 'INTRAOP', 'ONCE', 'TP03', 'D7'),
('术中连续', 'INTRAOP', 'CONTINUOUS', 'TP03', 'D7'),
('术前', 'PRE_TX', 'ONCE', 'TP01', 'D1'),
('术前', 'PRE_TX', 'ONCE', 'TP01', 'D9'),
('术前1月每2-3d', 'PRE_TX', 'BIWEEKLY', NULL, 'D9'),
('术后每2周', 'POST_TX', 'BIWEEKLY', NULL, 'D9'),
('术毕', 'INTRAOP', 'ONCE', 'TP03', 'D7'),
('植入', 'DAY0', 'ONCE', 'TP03', 'D9'),
('每1-3h', 'PERFUSION', 'Q1_3H', NULL, 'D10'),
('每15-30min', 'PERFUSION', 'Q15_30MIN', NULL, 'D10'),
('每2周', 'POST_TX', 'BIWEEKLY', NULL, 'D9'),
('每3h', 'PERFUSION', 'Q3H', NULL, 'D10'),
('每小时', 'PERFUSION', 'HOURLY', NULL, 'D10'),
('每次给药', 'REGIMEN', 'PER_DOSE', NULL, 'D6'),
('治疗前后', 'POST_TX', 'PER_EVENT', NULL, 'D9'),
('灌注启动', 'PERFUSION', 'ONCE', NULL, 'D10'),
('灌注期', 'PERFUSION', 'CONTINUOUS', NULL, 'D7'),
('灌注结束', 'PERFUSION', 'ONCE', NULL, 'D10'),
('监测时点', 'REGIMEN', 'PER_LAB', NULL, 'D6'),
('终点', 'ENDPOINT', 'ONCE', 'TP11', 'D5'),
('维持期', 'POST_TX', 'CONTINUOUS', NULL, 'D7'),
('获取', 'HARVEST', 'ONCE', NULL, 'D9'),
('获取-植入', 'HARVEST', 'ONCE', NULL, 'D9'),
('获取前', 'HARVEST', 'ONCE', NULL, 'D9'),
('诱导期', 'ANES', 'ONCE', NULL, 'D7'),
('调整后', 'REGIMEN', 'EVENT', NULL, 'D6'),
('连接期', 'PERFUSION', 'ONCE', NULL, 'D10'),
('遥测持续', 'POST_TX', 'CONTINUOUS', NULL, 'D9'),
('阅片', 'READOUT', 'ONCE', NULL, 'D8'),
('麻醉开始', 'ANES', 'ONCE', NULL, 'D7'),
('麻醉诱导', 'ANES', 'ONCE', NULL, 'D9');
