-- SOP 操作文档：分类树。文件本体复用 admin_file_template，见 bootstrap-sop-document.sql
CREATE TABLE IF NOT EXISTS sop_node (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    parent_id   BIGINT       NULL COMMENT '父节点；NULL=顶层分类',
    name        VARCHAR(128) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_sop_node_parent (parent_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SOP 操作文档分类树';
