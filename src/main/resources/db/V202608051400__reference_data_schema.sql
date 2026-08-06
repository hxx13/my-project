CREATE TABLE IF NOT EXISTS ref_data (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ref_type VARCHAR(50) NOT NULL COMMENT 'ANIMAL_BREED/STRAIN/GENOTYPE/SUPPLIER',
    parent_id BIGINT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 1 COMMENT '1=normal 0=disabled',
    field_data JSON COMMENT 'type-specific fields + purchasable + specTemplateIds + customSpecs',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE INDEX uq_ref_type_parent_sort (ref_type, parent_id, sort_order),
    INDEX idx_ref_type_status (ref_type, status),
    INDEX idx_parent_id (parent_id),
    CONSTRAINT fk_ref_parent FOREIGN KEY (parent_id) REFERENCES ref_data(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='参考数据主表';

CREATE TABLE IF NOT EXISTS ref_spec_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    scope VARCHAR(20) NOT NULL DEFAULT 'ALL' COMMENT 'ALL / BREED_TYPE',
    breed_type VARCHAR(50) NULL,
    options JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='规格模板';

CREATE TABLE IF NOT EXISTS ref_cart (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(100) NOT NULL,
    ref_data_id BIGINT NOT NULL,
    spec_selections JSON COMMENT '{"age":"6W","gender":"male"}',
    quantity INT NOT NULL DEFAULT 1,
    remark VARCHAR(500) NULL,
    added_by VARCHAR(100) NOT NULL,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_cart_group (group_id),
    CONSTRAINT fk_cart_ref FOREIGN KEY (ref_data_id) REFERENCES ref_data(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='参考数据购物车';

CREATE TABLE IF NOT EXISTS ref_order (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    group_id VARCHAR(100) NOT NULL,
    submitter_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED/COMPLETED/CANCELLED',
    submit_remark VARCHAR(500) NULL,
    submitted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_group (group_id),
    INDEX idx_order_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='参考数据订单主表';

CREATE TABLE IF NOT EXISTS ref_order_line (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    ref_data_id BIGINT NOT NULL,
    spec_selections JSON,
    quantity INT NOT NULL DEFAULT 1,
    line_remark VARCHAR(500) NULL,
    CONSTRAINT fk_line_order FOREIGN KEY (order_id) REFERENCES ref_order(id) ON DELETE CASCADE,
    CONSTRAINT fk_line_ref FOREIGN KEY (ref_data_id) REFERENCES ref_data(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='参考数据订单明细行';

CREATE TABLE IF NOT EXISTS ref_order_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    action VARCHAR(30) NOT NULL COMMENT 'CREATED/SUBMITTED/APPROVED/REJECTED/COMPLETED/CANCELLED',
    operator_id VARCHAR(100) NOT NULL,
    detail TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_log_order FOREIGN KEY (order_id) REFERENCES ref_order(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='参考数据订单操作日志';
