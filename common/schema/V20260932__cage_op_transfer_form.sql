-- 转移单：学生填写的字段值（JSON）+ 终局归档 PDF 的相对文件名。
-- 仅归档记录，实际执行在 CageShelfSchemaMigrator（加列非幂等，靠吞重复列错误保证可重跑）。
ALTER TABLE cage_op_request
    ADD COLUMN transfer_form JSON NULL COMMENT '转移单学生填写值';

ALTER TABLE cage_op_request
    ADD COLUMN transfer_form_file_ref VARCHAR(255) NULL COMMENT '终局归档转移单PDF文件名';
