-- 笼位域独立码表（与 NHP crf_codelist 隔离）
CREATE TABLE IF NOT EXISTS cage_info_codelist (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(64) NOT NULL COMMENT '码表编码（笼位域命名空间）',
    name VARCHAR(128) NOT NULL COMMENT '码表中文名',
    folder VARCHAR(64) NULL COMMENT '文件夹分类（NULL=未分类）',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_info_codelist_code (code),
    KEY idx_cage_info_codelist_folder (folder)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位域码表';

CREATE TABLE IF NOT EXISTS cage_info_codelist_item (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codelist_id BIGINT NOT NULL COMMENT '码表ID → cage_info_codelist.id',
    item_code VARCHAR(64) NOT NULL COMMENT '内部值（唯一）',
    item_label VARCHAR(256) NOT NULL COMMENT '展示文本',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cage_codelist_item (codelist_id, item_code),
    KEY idx_cage_codelist_item_sort (codelist_id, sort_order),
    CONSTRAINT fk_cage_codelist_item_codelist
        FOREIGN KEY (codelist_id) REFERENCES cage_info_codelist (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='笼位域码表项';
