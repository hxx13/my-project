-- 规则级处置策略：给 twin_violation_rule 加 disposition_type / disposition_config_json。
-- 背景：违规记录（twin_obligation）早已支持处置策略，但触发规则表缺这两列，
--       导致「笼架联动规则配置 → 处置策略」下拉选了存不下来（无落点）。
--
-- 为什么本文件不能走 bootstrap runScript 清单：
--   ADD COLUMN 不是幂等的（重复执行抛 "Duplicate column"）。若塞进 bootstrap 的
--   一文件一条 DDL 链，benign 失败分支会把它整段吞掉且不报错；且 bootstrap 先于
--   任何列检查执行。故实际执行放在 TwinViolationSchemaMigrator
--   （StartupRunner @Order(130)）的 ensureDispositionColumn()：只把「已存在」类异常
--   当成功，其余异常 log.warn 留痕。本文件仅作归档记录。
ALTER TABLE twin_violation_rule
    ADD COLUMN disposition_type VARCHAR(32) NULL COMMENT '处置策略编码 SHOW_ONLY/ACK_READ/ACK_PUZZLE/QUIZ/SIGNATURE';

ALTER TABLE twin_violation_rule
    ADD COLUMN disposition_config_json TEXT NULL COMMENT '处置策略自带配置JSON';
