-- 列表查询按 folder_id + purpose 过滤后按时间倒序
ALTER TABLE admin_file_template
    ADD KEY idx_aft_folder (folder_id, purpose, create_time);
