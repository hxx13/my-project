-- 物品台账（RFID 空间可视化）归档迁移
-- 模块 inventory：空间树 / 分类树 / 物品 / 留痕 / 盘点会话 / 盘点明细 / 上传图标
-- 与 src/main/resources/db/bootstrap-inventory.sql 保持一致（幂等）

CREATE TABLE IF NOT EXISTS inv_space (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    parent_id BIGINT NULL COMMENT '父空间ID，NULL=根节点',
    name VARCHAR(128) NOT NULL COMMENT '空间名称',
    type VARCHAR(32) NOT NULL DEFAULT 'room' COMMENT '楼/楼层/房间/区域/柜/其他',
    icon VARCHAR(255) NULL COMMENT '节点图标',
    pos_x DOUBLE NULL COMMENT '几何坐标X（相对父画布归一化）',
    pos_y DOUBLE NULL COMMENT '几何坐标Y',
    width DOUBLE NULL COMMENT '几何宽度',
    height DOUBLE NULL COMMENT '几何高度',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
    code VARCHAR(64) NULL COMMENT '位置标签码（可选，扫位置码定位盘点）',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '软删：1=删',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_is_parent (parent_id),
    INDEX idx_is_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物品台账-空间树';

CREATE TABLE IF NOT EXISTS inv_category (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    parent_id BIGINT NULL COMMENT '父分类ID，NULL=根',
    name VARCHAR(128) NOT NULL COMMENT '分类名称',
    icon_type VARCHAR(16) NOT NULL DEFAULT 'builtin' COMMENT 'builtin=内置图标 / upload=上传图标',
    icon_value VARCHAR(512) NULL COMMENT '内置图标key或上传URL',
    sort_order INT NOT NULL DEFAULT 0,
    deleted TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ic_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物品台账-分类树';

CREATE TABLE IF NOT EXISTS inv_item (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    rfid_code VARCHAR(64) NULL COMMENT 'RFID/EPC码，可空=提前登记待贴码（非空唯一）',
    name VARCHAR(128) NOT NULL COMMENT '物品名称',
    category_id BIGINT NULL COMMENT '分类ID',
    space_id BIGINT NULL COMMENT '当前所在空间节点ID（区域也是空间）',
    granularity VARCHAR(16) NOT NULL DEFAULT 'UNIT' COMMENT 'UNIT=一物一码 / BATCH=一批一码',
    qty INT NOT NULL DEFAULT 1 COMMENT 'BATCH用数量，UNIT恒为1',
    status VARCHAR(24) NOT NULL DEFAULT 'IN_USE' COMMENT 'IN_USE=在库 / MISSING=丢失待确认 / RETIRED=已废弃',
    icon_type VARCHAR(16) NULL COMMENT '可选：覆盖分类图标的类型',
    icon_value VARCHAR(512) NULL COMMENT '可选：覆盖分类图标的值',
    brand VARCHAR(64) NULL COMMENT '品牌',
    model VARCHAR(64) NULL COMMENT '型号',
    spec VARCHAR(128) NULL COMMENT '规格',
    expire_at DATETIME NULL COMMENT '有效期（药品/耗材）',
    supplier VARCHAR(128) NULL COMMENT '供应商',
    purchase_no VARCHAR(64) NULL COMMENT '采购单号',
    price DECIMAL(12,2) NULL COMMENT '单价',
    purchase_date DATE NULL COMMENT '采购日期',
    warranty_until DATE NULL COMMENT '质保到期',
    fund_source VARCHAR(128) NULL COMMENT '经费来源/项目',
    ext JSON NULL COMMENT '扩展字段',
    cover_url VARCHAR(512) NULL COMMENT '封面图URL',
    detail_images JSON NULL COMMENT '详情图URL数组',
    last_scanned_at DATETIME NULL COMMENT '最近盘点扫描时间',
    created_by VARCHAR(64) NULL COMMENT '创建人ID',
    deleted TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_inv_item_code (rfid_code),
    INDEX idx_ii_space (space_id),
    INDEX idx_ii_category (category_id),
    INDEX idx_ii_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物品台账-物品';

CREATE TABLE IF NOT EXISTS inv_item_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    item_id BIGINT NOT NULL COMMENT '物品ID',
    log_type VARCHAR(32) NOT NULL COMMENT 'CREATE/UPDATE/TRANSFER/SCAN_FOUND/SCAN_NEW/SCAN_MISSING/RETIRE',
    from_space_id BIGINT NULL COMMENT '来源空间',
    to_space_id BIGINT NULL COMMENT '目标空间',
    operator_user_id VARCHAR(64) NULL COMMENT '操作人ID',
    remark VARCHAR(500) NULL,
    extra JSON NULL COMMENT '扩展（如关联盘点会话id）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_iil_item (item_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物品台账-留痕日志（只追加）';

CREATE TABLE IF NOT EXISTS inv_scan_session (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    space_id BIGINT NOT NULL COMMENT '被盘点空间ID',
    operator_user_id VARCHAR(64) NULL COMMENT '操作人ID',
    status VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS' COMMENT 'IN_PROGRESS/COMMITTED/CANCELLED',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    committed_at DATETIME NULL,
    scanned_count INT NOT NULL DEFAULT 0 COMMENT '扫描数',
    found_count INT NOT NULL DEFAULT 0 COMMENT '在册数',
    new_count INT NOT NULL DEFAULT 0 COMMENT '新发现数',
    missing_count INT NOT NULL DEFAULT 0 COMMENT '疑似丢失数',
    remark VARCHAR(500) NULL,
    INDEX idx_iss_space (space_id),
    INDEX idx_iss_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物品台账-盘点会话';

CREATE TABLE IF NOT EXISTS inv_scan_line (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL COMMENT '会话ID',
    rfid_code VARCHAR(64) NOT NULL COMMENT '扫到的码',
    matched_item_id BIGINT NULL COMMENT '命中的物品ID，NULL=新发现',
    line_type VARCHAR(16) NOT NULL COMMENT 'IN_PLACE=在册 / ELSEWHERE=异地 / NEW=新发现',
    scanned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_isl_session (session_id),
    UNIQUE KEY uk_isl_session_code (session_id, rfid_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物品台账-盘点明细';

CREATE TABLE IF NOT EXISTS inv_upload_icon (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL COMMENT '图标名称',
    url VARCHAR(512) NOT NULL COMMENT '图标URL',
    mime VARCHAR(64) NULL,
    uploaded_by VARCHAR(64) NULL COMMENT '上传人ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_iui_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物品台账-上传图标';
