-- 文件所属文件夹；NULL = 未归类（存量数据全部落在这里）
ALTER TABLE admin_file_template
    ADD COLUMN folder_id BIGINT DEFAULT NULL COMMENT '所属文件夹ID，NULL=未归类';
