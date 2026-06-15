-- 填报报表：新增来源字段
ALTER TABLE report_form_definition
  ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'blank'
  COMMENT '来源：blank=空白, excel=Excel导入, word=Word导入, template=从模板创建';
