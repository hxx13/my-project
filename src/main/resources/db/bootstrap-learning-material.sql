-- 学习资料：文件本体复用 admin_file_template，这里只登记标题/分类/排序/上下架
CREATE TABLE IF NOT EXISTS learning_material (
    id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    file_id     VARCHAR(36)  NOT NULL COMMENT 'admin_file_template.id',
    title       VARCHAR(255) NOT NULL,
    category    VARCHAR(64)  NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    active      TINYINT      NOT NULL DEFAULT 1 COMMENT '1=上架(学生可见) 0=下架',
    created_by  VARCHAR(50)  NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_learning_material_active (active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学习资料（PDF）';
