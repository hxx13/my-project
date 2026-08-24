-- =============================================================
-- AUP 字典项 value/label 加宽：内联选项种入码表后，长选项文本
-- （如 F 课题组长声明单条 213 字）超过原 value VARCHAR(128)，导致种子 INSERT 截断。
-- 与 src/main/resources/db/bootstrap-aup-dict-item-value-width.sql 同源（后者幂等探测）。
-- =============================================================
ALTER TABLE dict_item MODIFY COLUMN value VARCHAR(512) NOT NULL COMMENT '落库值（稳定码，宽列承载长选项文本）';
ALTER TABLE dict_item MODIFY COLUMN label VARCHAR(512) NOT NULL COMMENT '展示文本';
