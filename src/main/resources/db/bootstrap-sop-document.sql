-- SOP 操作文档：本表只登记分类/标题/排序，文件本体与字节流复用 admin_file_template
CREATE TABLE IF NOT EXISTS sop_document (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    node_id     BIGINT       NULL COMMENT '所属分类节点；NULL=未分类',
    file_id     VARCHAR(36)  NOT NULL COMMENT 'admin_file_template.id',
    title       VARCHAR(255) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    created_by  VARCHAR(50)  NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_sop_document_node (node_id, sort_order),
    KEY idx_sop_document_file (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SOP 操作文档（PDF）';
