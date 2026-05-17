CREATE TABLE IF NOT EXISTS aro_access_log (
    id VARCHAR(50) PRIMARY KEY,
    accessType INT COMMENT '进出动作类型',
    create_time VARCHAR(30) COMMENT '刷卡时间',
    user_id VARCHAR(50),
    name VARCHAR(50) COMMENT '人员姓名',
    email VARCHAR(100),
    mobile_phone VARCHAR(20),
    office_phone VARCHAR(20),
    user_type_names VARCHAR(100),
    department_id VARCHAR(50),
    project_group_id VARCHAR(50),
    project_group_names VARCHAR(100) COMMENT '课题组名称',
    area_id VARCHAR(50),
    area_name VARCHAR(50) COMMENT '校区名称',
    floor_id VARCHAR(50),
    floor_name VARCHAR(50) COMMENT '楼层名称',
    room_id VARCHAR(50),
    room_name VARCHAR(50) COMMENT '房间名称',
    is_shared_card INT DEFAULT 0 COMMENT '是否结伴免取卡',
    is_keep_card INT DEFAULT 0 COMMENT '是否长期不还卡',
    is_borrowed_card INT DEFAULT 0 COMMENT '是否领借公卡'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ARO 门禁流水表';

CREATE TABLE IF NOT EXISTS twin_blacklist (
    user_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) COMMENT '姓名',
    reason VARCHAR(255) COMMENT '封禁原因',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='孪生系统黑名单表';

CREATE TABLE IF NOT EXISTS room_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    campus VARCHAR(50) NOT NULL COMMENT '校区',
    room_name VARCHAR(100) NOT NULL COMMENT '房间名',
    capacity INT NOT NULL DEFAULT 15 COMMENT '容量',
    mapping_aliases VARCHAR(1000) COMMENT '映射别名',
    capacity_bind_room_id VARCHAR(2000) NULL COMMENT '流水 room_id：可多值逗号分隔，多后室共前室限载；与 aro_access_log.room_id 对齐',
    is_active INT DEFAULT 1 COMMENT '是否启用',
    UNIQUE KEY uk_room_config_campus_room (campus, room_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间字典配置表';

-- 兼容历史库：room_config 增加流水 room_id 绑定列
SET @rc_bind_col := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'room_config'
      AND COLUMN_NAME = 'capacity_bind_room_id'
);
SET @rc_bind_sql := IF(
    @rc_bind_col = 0,
    'ALTER TABLE room_config ADD COLUMN capacity_bind_room_id VARCHAR(2000) NULL COMMENT ''流水 room_id：可多值逗号分隔''',
    'SELECT 1'
);
PREPARE stmt_rc_bind FROM @rc_bind_sql;
EXECUTE stmt_rc_bind;
DEALLOCATE PREPARE stmt_rc_bind;

CREATE TABLE IF NOT EXISTS aro_animal_order (
    item_id BIGINT PRIMARY KEY COMMENT '订单明细ID',
    sn VARCHAR(50) COMMENT '订单号',
    area_name VARCHAR(20) COMMENT '校区',
    project_name VARCHAR(100) COMMENT '课题组名称',
    pi_name VARCHAR(50) COMMENT 'PI名称',
    create_time VARCHAR(30) COMMENT '下单时间',
    arrival_date VARCHAR(30) COMMENT '到货日期',
    supplier_name VARCHAR(100) COMMENT '供应商',
    strain_name VARCHAR(50) COMMENT '品系',
    spec_name VARCHAR(50) COMMENT '规格',
    male_qty INT COMMENT '雄性数量',
    female_qty INT COMMENT '雌性数量',
    collector_name VARCHAR(50) COMMENT '领用人',
    collector_tel VARCHAR(30) COMMENT '联系方式',
    order_state_name VARCHAR(20) COMMENT '订单状态',
    consume_location VARCHAR(50) COMMENT '领用位置',
    memo TEXT COMMENT '备注'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='实验动物订单流水';

CREATE TABLE IF NOT EXISTS aro_personnel (
    user_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(50) COMMENT '姓名',
    job_number VARCHAR(50) COMMENT '工号',
    id_number VARCHAR(50) COMMENT '证件号',
    head VARCHAR(255) COMMENT '头像URL',
    gender INT COMMENT '性别',
    mobile_phone VARCHAR(20) COMMENT '手机号',
    email VARCHAR(100),
    department_name VARCHAR(100) COMMENT '部门名称',
    project_group_name VARCHAR(100) COMMENT '课题组名称',
    user_type_names VARCHAR(100) COMMENT '用户类型',
    user_class_name VARCHAR(100) COMMENT '人员分类',
    is_school INT COMMENT '是否校内',
    state INT COMMENT '状态',
    join_room_name VARCHAR(255) COMMENT '加入房间',
    allowed_rooms_json TEXT COMMENT '可访问房间JSON',
    allowed_rooms_display_zh VARCHAR(4000) NULL COMMENT '官方可进房间映射后的可读列表（含校区）',
    has_official_room_permission TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=有官方可进房间(展示或JSON非空) 0=无，供档案库排序',
    total_exp INT DEFAULT 0 COMMENT '总经验值',
    update_time VARCHAR(30) COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ARO 人员资料表';

CREATE TABLE IF NOT EXISTS aro_room_settings (
    room_id VARCHAR(50) PRIMARY KEY,
    max_capacity INT COMMENT '最大容量'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='房间容量配置表';

CREATE TABLE IF NOT EXISTS aro_behavior_prediction (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50),
    user_name VARCHAR(50) COMMENT '姓名',
    room_id VARCHAR(50),
    room_name VARCHAR(50) COMMENT '房间名称',
    day_type VARCHAR(20) COMMENT '日类型',
    median_duration_mins INT COMMENT '中位驻留时长(分钟)',
    peak_entry_time VARCHAR(20) COMMENT '高峰入场时间',
    overtime_prob DOUBLE COMMENT '超时概率',
    entry_curve_json TEXT COMMENT '入场曲线',
    exit_curve_json TEXT COMMENT '离场曲线',
    next_room_prob_json TEXT COMMENT '下一去向概率',
    companion_impact_json TEXT COMMENT '社交因子',
    is_cold_start INT COMMENT '是否冷启动',
    update_time VARCHAR(30) COMMENT '更新时间',
    weekly_entry_curve_json TEXT COMMENT '周入场曲线',
    weekly_exit_curve_json TEXT COMMENT '周离场曲线'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='个人行为预测表';

CREATE TABLE IF NOT EXISTS aro_group_room_prediction (
    id VARCHAR(50) PRIMARY KEY,
    group_name VARCHAR(100) COMMENT '课题组名称',
    room_id VARCHAR(50),
    room_name VARCHAR(50) COMMENT '房间名称',
    peak_entry_time VARCHAR(20) COMMENT '高峰入场',
    peak_exit_time VARCHAR(20) COMMENT '高峰离场',
    heatmap_matrix_json TEXT COMMENT '热力矩阵',
    update_time VARCHAR(30) COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课题组空间预测表';

CREATE TABLE IF NOT EXISTS twin_card_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    card_no VARCHAR(50) NOT NULL,
    dahua_seq VARCHAR(50) NOT NULL,
    dahua_person_code VARCHAR(64) NULL COMMENT '大华人员编码(用于权限下发/回收)',
    aro_user_id VARCHAR(50) NOT NULL,
    card_status VARCHAR(20) DEFAULT 'NORMAL' COMMENT '卡状态',
    freeze_exempt_flag INT DEFAULT 0 COMMENT '冻结豁免标记',
    last_modified_time VARCHAR(30) COMMENT '最后修改时间',
    UNIQUE KEY uk_twin_card_mapping_card_no (card_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物理卡片映射表';

CREATE TABLE IF NOT EXISTS sys_user (
    id VARCHAR(50) PRIMARY KEY COMMENT '与人员结构库一致的ID',
    username VARCHAR(64) UNIQUE COMMENT '登录账号',
    password VARCHAR(255) COMMENT '登录密码',
    open_id VARCHAR(128) UNIQUE COMMENT '微信OpenID',
    role VARCHAR(32) NOT NULL DEFAULT 'STUDENT' COMMENT '角色编码',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '账号状态:1启用,0禁用',
    password_reset_required TINYINT NOT NULL DEFAULT 0 COMMENT '是否需在个人中心改密:1是,0否',
    display_nickname VARCHAR(64) NULL COMMENT '展示昵称（无人员库姓名时用于报修/采购/物资等申请人展示）',
    mini_bind_type VARCHAR(16) NULL COMMENT '微信小程序绑定方式:STUDENT|STAFF',
    mini_preferences_json LONGTEXT NULL COMMENT '小程序个人配置JSON（房间关注区域等）',
    auth_profile VARCHAR(32) NULL COMMENT '认证来源:WECHAT_ARO微信+ARO绑定|WEB_PASSWORD Web账号密码',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一认证用户表';

-- 兼容历史库：如果 sys_user 是老表（无 status 列），先补齐字段
-- 注意：MySQL 某些版本不支持 ADD COLUMN IF NOT EXISTS，这里改为 information_schema 动态判断
SET @status_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'status'
);
SET @status_sql := IF(
    @status_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN status TINYINT NOT NULL DEFAULT 1 COMMENT ''账号状态:1启用,0禁用''',
    'SELECT 1'
);
PREPARE stmt_status FROM @status_sql;
EXECUTE stmt_status;
DEALLOCATE PREPARE stmt_status;

-- 首次登录强制改密标记（与 UserMapper 一致）
SET @pwd_reset_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'password_reset_required'
);
SET @pwd_reset_sql := IF(
    @pwd_reset_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN password_reset_required TINYINT NOT NULL DEFAULT 0 COMMENT ''是否需在个人中心改密:1是,0否''',
    'SELECT 1'
);
PREPARE stmt_pwd_reset FROM @pwd_reset_sql;
EXECUTE stmt_pwd_reset;
DEALLOCATE PREPARE stmt_pwd_reset;

-- 展示昵称（无人员库姓名的账号密码/员工账号使用）；小程序最后绑定方式
SET @nick_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'display_nickname'
);
SET @nick_sql := IF(
    @nick_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN display_nickname VARCHAR(64) NULL COMMENT ''展示昵称（无人员库姓名时用于报修/采购/物资等申请人展示）''',
    'SELECT 1'
);
PREPARE stmt_nick FROM @nick_sql;
EXECUTE stmt_nick;
DEALLOCATE PREPARE stmt_nick;

SET @mbt_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'mini_bind_type'
);
SET @mbt_sql := IF(
    @mbt_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN mini_bind_type VARCHAR(16) NULL COMMENT ''微信小程序绑定方式:STUDENT|STAFF''',
    'SELECT 1'
);
PREPARE stmt_mbt FROM @mbt_sql;
EXECUTE stmt_mbt;
DEALLOCATE PREPARE stmt_mbt;

SET @mpref_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'mini_preferences_json'
);
SET @mpref_sql := IF(
    @mpref_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN mini_preferences_json LONGTEXT NULL COMMENT ''小程序个人配置JSON（房间关注区域等）''',
    'SELECT 1'
);
PREPARE stmt_mpref FROM @mpref_sql;
EXECUTE stmt_mpref;
DEALLOCATE PREPARE stmt_mpref;

SET @ap_col_exists := (
    SELECT COUNT(1)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sys_user'
      AND COLUMN_NAME = 'auth_profile'
);
SET @ap_sql := IF(
    @ap_col_exists = 0,
    'ALTER TABLE sys_user ADD COLUMN auth_profile VARCHAR(32) NULL COMMENT ''认证来源:WECHAT_ARO|WEB_PASSWORD''',
    'SELECT 1'
);
PREPARE stmt_ap FROM @ap_sql;
EXECUTE stmt_ap;
DEALLOCATE PREPARE stmt_ap;

-- 预设超级管理员（仅开发/首次初始化；生产环境请改密或删除后自行开户）
-- Web 登录：POST /api/auth/login/web 使用 username + password
INSERT INTO sys_user (id, username, password, open_id, role, status, auth_profile)
VALUES ('SYS_SUPER_ROOT', 'superadmin', 'SuperAdmin@2026', NULL, 'PLATFORM_OWNER', 1, 'WEB_PASSWORD')
ON DUPLICATE KEY UPDATE
    username = VALUES(username),
    password = VALUES(password),
    role = VALUES(role),
    status = VALUES(status);

CREATE TABLE IF NOT EXISTS auth_bind_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    open_id VARCHAR(128) NOT NULL COMMENT '微信OpenID',
    identifier VARCHAR(64) NOT NULL COMMENT '提交的标识(学号/工号)',
    bind_type VARCHAR(32) NOT NULL COMMENT '绑定类型',
    client_ip VARCHAR(64) COMMENT '客户端IP',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT '处理状态',
    message VARCHAR(255) COMMENT '备注信息',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='绑定失败待处理记录';

CREATE TABLE IF NOT EXISTS repair_order (
    id VARCHAR(64) PRIMARY KEY,
    applicant_id VARCHAR(50) NOT NULL COMMENT '申请人ID',
    applicant_name VARCHAR(100) COMMENT '申请人名称',
    location VARCHAR(255) NOT NULL COMMENT '报修位置',
    content TEXT NOT NULL COMMENT '报修内容',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT '工单状态',
    request_images_json TEXT COMMENT '报修图片URL列表JSON',
    result_images_json TEXT COMMENT '处理图片URL列表JSON',
    result_remark VARCHAR(500) COMMENT '处理备注',
    processor_id VARCHAR(50) COMMENT '处理人ID',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '报修时间',
    start_time DATETIME NULL COMMENT '开始处理时间',
    finish_time DATETIME NULL COMMENT '完成时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_repair_applicant (applicant_id),
    INDEX idx_repair_status (status),
    INDEX idx_repair_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报修工单表';

SET @repair_deleted_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'repair_order' AND COLUMN_NAME = 'deleted'
);
SET @repair_deleted_sql := IF(
    @repair_deleted_exists = 0,
    'ALTER TABLE repair_order ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 COMMENT ''是否删除:1是,0否''',
    'SELECT 1'
);
PREPARE stmt_repair_deleted FROM @repair_deleted_sql;
EXECUTE stmt_repair_deleted;
DEALLOCATE PREPARE stmt_repair_deleted;

SET @repair_deleted_time_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'repair_order' AND COLUMN_NAME = 'deleted_time'
);
SET @repair_deleted_time_sql := IF(
    @repair_deleted_time_exists = 0,
    'ALTER TABLE repair_order ADD COLUMN deleted_time DATETIME NULL COMMENT ''删除时间''',
    'SELECT 1'
);
PREPARE stmt_repair_deleted_time FROM @repair_deleted_time_sql;
EXECUTE stmt_repair_deleted_time;
DEALLOCATE PREPARE stmt_repair_deleted_time;

SET @repair_deleted_by_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'repair_order' AND COLUMN_NAME = 'deleted_by'
);
SET @repair_deleted_by_sql := IF(
    @repair_deleted_by_exists = 0,
    'ALTER TABLE repair_order ADD COLUMN deleted_by VARCHAR(50) NULL COMMENT ''删除人ID''',
    'SELECT 1'
);
PREPARE stmt_repair_deleted_by FROM @repair_deleted_by_sql;
EXECUTE stmt_repair_deleted_by;
DEALLOCATE PREPARE stmt_repair_deleted_by;

SET @repair_purge_after_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'repair_order' AND COLUMN_NAME = 'purge_after_time'
);
SET @repair_purge_after_sql := IF(
    @repair_purge_after_exists = 0,
    'ALTER TABLE repair_order ADD COLUMN purge_after_time DATETIME NULL COMMENT ''计划彻底清理时间''',
    'SELECT 1'
);
PREPARE stmt_repair_purge_after FROM @repair_purge_after_sql;
EXECUTE stmt_repair_purge_after;
DEALLOCATE PREPARE stmt_repair_purge_after;

SET @repair_is_public_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'repair_order' AND COLUMN_NAME = 'is_public'
);
SET @repair_is_public_sql := IF(
    @repair_is_public_exists = 0,
    'ALTER TABLE repair_order ADD COLUMN is_public TINYINT NOT NULL DEFAULT 0 COMMENT ''公开状态:1公开,0个人''',
    'SELECT 1'
);
PREPARE stmt_repair_is_public FROM @repair_is_public_sql;
EXECUTE stmt_repair_is_public;
DEALLOCATE PREPARE stmt_repair_is_public;

CREATE TABLE IF NOT EXISTS purchase_order (
    id VARCHAR(64) PRIMARY KEY,
    applicant_id VARCHAR(50) NOT NULL COMMENT '申请人ID',
    applicant_name VARCHAR(100) COMMENT '申请人名称',
    location VARCHAR(255) NOT NULL COMMENT '申请位置',
    content TEXT NOT NULL COMMENT '采购内容',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT '工单状态',
    request_images_json TEXT COMMENT '申请图片URL列表JSON',
    result_images_json TEXT COMMENT '处理图片URL列表JSON',
    result_remark VARCHAR(500) COMMENT '处理备注',
    processor_id VARCHAR(50) COMMENT '处理人ID',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '申请时间',
    start_time DATETIME NULL COMMENT '开始处理时间',
    finish_time DATETIME NULL COMMENT '完成时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_purchase_applicant (applicant_id),
    INDEX idx_purchase_status (status),
    INDEX idx_purchase_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='采购工单表';

SET @purchase_deleted_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'deleted'
);
SET @purchase_deleted_sql := IF(
    @purchase_deleted_exists = 0,
    'ALTER TABLE purchase_order ADD COLUMN deleted TINYINT NOT NULL DEFAULT 0 COMMENT ''是否删除:1是,0否''',
    'SELECT 1'
);
PREPARE stmt_purchase_deleted FROM @purchase_deleted_sql;
EXECUTE stmt_purchase_deleted;
DEALLOCATE PREPARE stmt_purchase_deleted;

SET @purchase_deleted_time_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'deleted_time'
);
SET @purchase_deleted_time_sql := IF(
    @purchase_deleted_time_exists = 0,
    'ALTER TABLE purchase_order ADD COLUMN deleted_time DATETIME NULL COMMENT ''删除时间''',
    'SELECT 1'
);
PREPARE stmt_purchase_deleted_time FROM @purchase_deleted_time_sql;
EXECUTE stmt_purchase_deleted_time;
DEALLOCATE PREPARE stmt_purchase_deleted_time;

SET @purchase_deleted_by_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'deleted_by'
);
SET @purchase_deleted_by_sql := IF(
    @purchase_deleted_by_exists = 0,
    'ALTER TABLE purchase_order ADD COLUMN deleted_by VARCHAR(50) NULL COMMENT ''删除人ID''',
    'SELECT 1'
);
PREPARE stmt_purchase_deleted_by FROM @purchase_deleted_by_sql;
EXECUTE stmt_purchase_deleted_by;
DEALLOCATE PREPARE stmt_purchase_deleted_by;

SET @purchase_purge_after_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'purge_after_time'
);
SET @purchase_purge_after_sql := IF(
    @purchase_purge_after_exists = 0,
    'ALTER TABLE purchase_order ADD COLUMN purge_after_time DATETIME NULL COMMENT ''计划彻底清理时间''',
    'SELECT 1'
);
PREPARE stmt_purchase_purge_after FROM @purchase_purge_after_sql;
EXECUTE stmt_purchase_purge_after;
DEALLOCATE PREPARE stmt_purchase_purge_after;

SET @purchase_is_public_exists := (
    SELECT COUNT(1) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order' AND COLUMN_NAME = 'is_public'
);
SET @purchase_is_public_sql := IF(
    @purchase_is_public_exists = 0,
    'ALTER TABLE purchase_order ADD COLUMN is_public TINYINT NOT NULL DEFAULT 0 COMMENT ''公开状态:1公开,0个人''',
    'SELECT 1'
);
PREPARE stmt_purchase_is_public FROM @purchase_is_public_sql;
EXECUTE stmt_purchase_is_public;
DEALLOCATE PREPARE stmt_purchase_is_public;

CREATE TABLE IF NOT EXISTS asset_record (
    id VARCHAR(64) PRIMARY KEY,
    asset_code VARCHAR(128) NOT NULL COMMENT '资产编码',
    asset_name VARCHAR(255) NOT NULL COMMENT '资产名称',
    status VARCHAR(64) DEFAULT 'NORMAL' COMMENT '资产状态',
    location VARCHAR(255) COMMENT '当前位置',
    locked TINYINT NOT NULL DEFAULT 0 COMMENT '是否锁定',
    note VARCHAR(500) COMMENT '标注信息',
    latest_transfer_request_id VARCHAR(64) COMMENT '最新转移申请ID',
    create_by VARCHAR(50) COMMENT '创建人ID',
    update_by VARCHAR(50) COMMENT '更新人ID',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_asset_record_code (asset_code),
    INDEX idx_asset_record_name (asset_name),
    INDEX idx_asset_record_status (status),
    INDEX idx_asset_record_locked (locked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产主表';

CREATE TABLE IF NOT EXISTS asset_column_def (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    column_key VARCHAR(64) NOT NULL COMMENT '列键',
    column_label VARCHAR(128) NOT NULL COMMENT '列名',
    value_type VARCHAR(32) NOT NULL DEFAULT 'TEXT' COMMENT '值类型',
    sortable TINYINT NOT NULL DEFAULT 1 COMMENT '是否可排序',
    searchable TINYINT NOT NULL DEFAULT 1 COMMENT '是否可搜索',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序序号',
    create_by VARCHAR(50) COMMENT '创建人ID',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_asset_column_key (column_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产动态列定义';

CREATE TABLE IF NOT EXISTS asset_record_value (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
    column_key VARCHAR(64) NOT NULL COMMENT '列键',
    column_value TEXT COMMENT '列值',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_asset_value_asset_col (asset_id, column_key),
    INDEX idx_asset_value_col (column_key),
    INDEX idx_asset_value_asset (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产动态列值';

CREATE TABLE IF NOT EXISTS asset_transfer_request (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
    asset_code VARCHAR(128) NOT NULL COMMENT '资产编码',
    asset_name VARCHAR(255) NOT NULL COMMENT '资产名称',
    applicant_id VARCHAR(50) NOT NULL COMMENT '申请人ID',
    applicant_name VARCHAR(100) COMMENT '申请人名称',
    transfer_time DATETIME NOT NULL COMMENT '申请转移时间',
    transfer_location VARCHAR(255) NOT NULL COMMENT '申请转移地点',
    remark VARCHAR(500) COMMENT '申请备注',
    photo_url TEXT COMMENT '上传照片URL',
    status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED' COMMENT '申请状态',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_asset_transfer_asset (asset_id),
    INDEX idx_asset_transfer_applicant (applicant_id),
    INDEX idx_asset_transfer_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产转移申请';

CREATE TABLE IF NOT EXISTS asset_transfer_log (
    id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL COMMENT '申请ID',
    asset_id VARCHAR(64) NOT NULL COMMENT '资产ID',
    action_type VARCHAR(32) NOT NULL COMMENT '动作类型',
    operator_id VARCHAR(50) COMMENT '操作人ID',
    remark VARCHAR(500) COMMENT '备注',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_asset_transfer_log_request (request_id),
    INDEX idx_asset_transfer_log_asset (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资产转移流程日志';

CREATE TABLE IF NOT EXISTS twin_job_schedule_config (
    job_key VARCHAR(64) PRIMARY KEY COMMENT '任务唯一键',
    job_name VARCHAR(128) NOT NULL COMMENT '任务名称',
    enabled TINYINT NOT NULL DEFAULT 0 COMMENT '是否启用',
    schedule_type VARCHAR(16) NOT NULL DEFAULT 'DAILY' COMMENT 'DAILY/WEEKLY',
    schedule_time VARCHAR(8) NOT NULL DEFAULT '02:00' COMMENT 'HH:mm',
    week_days VARCHAR(32) NULL COMMENT '周计划:1,2,3..7',
    last_run_at DATETIME NULL COMMENT '最近执行时间',
    last_success_at DATETIME NULL COMMENT '最近成功时间',
    last_status VARCHAR(16) NULL COMMENT 'SUCCESS/FAILED/RUNNING',
    last_error VARCHAR(500) NULL COMMENT '最近错误摘要',
    updated_by VARCHAR(64) NULL COMMENT '更新人',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一定时任务配置与最近执行状态';

CREATE TABLE IF NOT EXISTS twin_access_correlation_pending (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    access_type INT NOT NULL COMMENT '1进入 2离开 与ARO save一致',
    user_id VARCHAR(64) NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    source_tag VARCHAR(32) NOT NULL,
    automation_log_id BIGINT NULL,
    summary_zh VARCHAR(512) NULL,
    detail_zh VARCHAR(2000) NULL,
    op_time DATETIME NOT NULL,
    consumed TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pending_match (user_id, room_id, access_type, consumed, op_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='官方流水落库前孪生登记，用于feed溯源批量匹配';

CREATE TABLE IF NOT EXISTS mini_program_release (
    id VARCHAR(40) PRIMARY KEY,
    version_code VARCHAR(64) NOT NULL COMMENT '版本号展示',
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(600) NULL COMMENT '列表摘要',
    body_html MEDIUMTEXT NULL COMMENT '富文本 HTML，小程序 rich-text',
    published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    show_on_launch TINYINT NOT NULL DEFAULT 0 COMMENT '首屏公告（全局至多一条为1）',
    created_by VARCHAR(64) NULL,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_mp_release_published (published_at DESC),
    KEY idx_mp_release_splash (show_on_launch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小程序版本更新与首屏公告';

CREATE TABLE IF NOT EXISTS mini_program_announcement (
    id VARCHAR(40) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(600) NULL COMMENT '列表摘要',
    body_html MEDIUMTEXT NULL COMMENT '富文本 HTML',
    published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    enabled TINYINT NOT NULL DEFAULT 1 COMMENT '1展示0下线',
    sort_order INT NOT NULL DEFAULT 0,
    created_by VARCHAR(64) NULL,
    updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_mp_ann_published (published_at DESC),
    KEY idx_mp_ann_enabled (enabled, published_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='小程序/Web 首页公告栏';

-- 检查维护（Web/小程序）：机房、巡查模板、耗材、更换记录（与 FacilityMaintenanceSchemaMigrator 一致）
CREATE TABLE IF NOT EXISTS fm_site (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    disabled TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_fm_site_sort (sort_order),
    KEY idx_fm_site_disabled (disabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='机房/巡查地点';

CREATE TABLE IF NOT EXISTS fm_option_set (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='下拉选项集';

CREATE TABLE IF NOT EXISTS fm_option_item (
    id VARCHAR(64) PRIMARY KEY,
    option_set_id VARCHAR(64) NOT NULL,
    label VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    KEY idx_fm_opt_item_set (option_set_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='下拉选项项';

CREATE TABLE IF NOT EXISTS fm_checklist_template (
    id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NULL COMMENT 'NULL=全局模板',
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_fm_tpl_site (site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板';

CREATE TABLE IF NOT EXISTS fm_template_site (
    template_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (template_id, site_id),
    KEY idx_fm_tpl_site_sid (site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板适用机房（多选；优先于 site_id 单字段）';

CREATE TABLE IF NOT EXISTS fm_template_item (
    id VARCHAR(64) PRIMARY KEY,
    template_id VARCHAR(64) NOT NULL,
    label VARCHAR(255) NOT NULL,
    field_type VARCHAR(32) NOT NULL COMMENT 'TEXT,NUMBER,BOOLEAN,SELECT,DATETIME',
    option_set_id VARCHAR(64) NULL,
    required_flag TINYINT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    KEY idx_fm_titem_tpl (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查模板项';

CREATE TABLE IF NOT EXISTS fm_inspection_record (
    id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    template_id VARCHAR(64) NULL,
    inspected_at DATETIME NOT NULL,
    operator_user_id VARCHAR(64) NULL,
    operator_name VARCHAR(128) NULL,
    values_json LONGTEXT NOT NULL COMMENT 'templateItemId->value',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_fm_insp_site (site_id),
    KEY idx_fm_insp_time (inspected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='巡查记录';

CREATE TABLE IF NOT EXISTS fm_consumable_line (
    id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    consumable_name VARCHAR(255) NOT NULL,
    qty DECIMAL(18,4) NOT NULL,
    unit VARCHAR(32) NULL,
    occurred_at DATETIME NOT NULL,
    note VARCHAR(500) NULL,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_fm_cons_site (site_id),
    KEY idx_fm_cons_time (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='耗材登记';

CREATE TABLE IF NOT EXISTS fm_replacement_record (
    id VARCHAR(64) PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    filter_type VARCHAR(64) NOT NULL COMMENT '初效/中效/高效等',
    replaced_at DATETIME NOT NULL,
    note VARCHAR(500) NULL,
    created_by VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_fm_rep_site (site_id),
    KEY idx_fm_rep_filter (site_id, filter_type),
    KEY idx_fm_rep_time (replaced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='更换记录(过滤器等)';

CREATE TABLE IF NOT EXISTS sys_site_config (
    id VARCHAR(32) PRIMARY KEY,
    config_key VARCHAR(64) NOT NULL,
    config_value_json LONGTEXT NULL COMMENT 'JSON 字符串',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_sys_site_config_key (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站点键值配置';

CREATE TABLE IF NOT EXISTS registration_invite (
    id VARCHAR(36) PRIMARY KEY,
    code_hash VARCHAR(128) NOT NULL COMMENT 'SHA-256 hex(pepper|code)',
    expires_at DATETIME NOT NULL,
    max_uses INT NOT NULL DEFAULT 1,
    used_count INT NOT NULL DEFAULT 0,
    created_by_user_id VARCHAR(50) NULL,
    invite_kind VARCHAR(16) NOT NULL DEFAULT 'ADMIN' COMMENT 'ADMIN=管理发放,PERSONAL=教职工自助',
    note VARCHAR(255) NULL,
    revoked TINYINT(1) NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_reg_inv_code_hash (code_hash),
    KEY idx_reg_inv_expires (expires_at),
    KEY idx_reg_inv_revoked (revoked),
    KEY idx_reg_inv_kind (invite_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教职工注册推荐码';

CREATE TABLE IF NOT EXISTS chat_conversation (
    id VARCHAR(36) PRIMARY KEY,
    min_user_id VARCHAR(50) NOT NULL,
    max_user_id VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at DATETIME NULL,
    UNIQUE KEY uk_chat_dm (min_user_id, max_user_id),
    KEY idx_chat_min (min_user_id),
    KEY idx_chat_max (max_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教职工一对一对话';

CREATE TABLE IF NOT EXISTS chat_attachment (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    storage_key VARCHAR(512) NOT NULL COMMENT '本地相对路径或未来 OSS key',
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hex CHAR(64) NULL,
    uploaded_by VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_chat_att_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信附件元数据';

CREATE TABLE IF NOT EXISTS chat_message (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(50) NOT NULL,
    body TEXT NULL,
    attachment_id VARCHAR(36) NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_msg_conv_time (conversation_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信消息';

CREATE TABLE IF NOT EXISTS chat_conversation_read (
    user_id VARCHAR(50) NOT NULL COMMENT '读游标所属用户',
    conversation_id VARCHAR(36) NOT NULL,
    last_read_at DATETIME(3) NOT NULL COMMENT '已读到该时间戳（含）之前的消息',
    PRIMARY KEY (user_id, conversation_id),
    KEY idx_ccr_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信会话已读游标（每人每会话一行）';

CREATE TABLE IF NOT EXISTS chat_user_conversation_prefs (
    user_id VARCHAR(50) NOT NULL COMMENT '偏好所属用户',
    conversation_id VARCHAR(36) NOT NULL,
    pinned TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=置顶',
    hidden_at DATETIME(3) NULL COMMENT '非空=本人已从会话列表移除（对方不受影响）',
    update_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (user_id, conversation_id),
    KEY idx_cucp_user_hidden (user_id, hidden_at),
    KEY idx_cucp_conv (conversation_id),
    CONSTRAINT fk_cucp_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversation(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内信会话每用户置顶与列表可见性';

CREATE TABLE IF NOT EXISTS chat_contact_group (
    id VARCHAR(36) PRIMARY KEY,
    owner_user_id VARCHAR(50) NOT NULL,
    name VARCHAR(64) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ccg_owner_sort (owner_user_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='教职工站内信通讯录自定义分组';

CREATE TABLE IF NOT EXISTS chat_contact_assignment (
    owner_user_id VARCHAR(50) NOT NULL,
    peer_user_id VARCHAR(50) NOT NULL,
    group_id VARCHAR(36) NULL COMMENT 'NULL=未分组',
    PRIMARY KEY (owner_user_id, peer_user_id),
    KEY idx_cca_owner (owner_user_id),
    KEY idx_cca_group (group_id),
    CONSTRAINT fk_cca_group FOREIGN KEY (group_id) REFERENCES chat_contact_group(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通讯录联系人与分组关系（仅本人可见）';

CREATE TABLE IF NOT EXISTS admin_file_template (
    id VARCHAR(36) PRIMARY KEY,
    original_name VARCHAR(512) NOT NULL,
    storage_key VARCHAR(512) NOT NULL COMMENT '相对上传根目录的存储路径',
    mime_type VARCHAR(128) NOT NULL DEFAULT '',
    size_bytes BIGINT NOT NULL,
    uploaded_by_user_id VARCHAR(50) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_admin_file_template_storage (storage_key),
    KEY idx_admin_file_template_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台「文件模板下载」元数据';

CREATE TABLE IF NOT EXISTS supply_inventory_movement (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    item_id BIGINT NOT NULL COMMENT '物资ID',
    movement_type VARCHAR(32) NOT NULL COMMENT 'INBOUND|OUTBOUND|ADJUST',
    qty INT NOT NULL COMMENT '变动数量',
    stock_after INT NULL COMMENT '变动后库存快照',
    claim_id VARCHAR(64) NULL COMMENT '关联领用单',
    claim_line_id BIGINT NULL COMMENT '关联领用明细行',
    operator_user_id VARCHAR(64) NULL COMMENT '处理人',
    applicant_user_id VARCHAR(64) NULL COMMENT '申请领用人',
    remark VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sim_item_time (item_id, created_at),
    KEY idx_sim_claim (claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物资库存出入库流水';

CREATE TABLE IF NOT EXISTS admin_page_help (
    page_path VARCHAR(512) NOT NULL PRIMARY KEY COMMENT 'Web 路由，如 /admin/supplies',
    body_html MEDIUMTEXT NULL COMMENT '富文本 HTML',
    updated_by VARCHAR(64) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台页面帮助正文';

CREATE TABLE IF NOT EXISTS admin_page_help_message (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    page_path VARCHAR(512) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    body VARCHAR(2000) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_admin_page_help_message_path (page_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台页面帮助留言';

CREATE TABLE IF NOT EXISTS supply_user_cart (
    user_id VARCHAR(64) NOT NULL PRIMARY KEY COMMENT 'sys_user.id',
    lines_json MEDIUMTEXT NOT NULL COMMENT 'JSON：物资 itemId 字符串 -> 数量',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='领用物资购物车（Web/小程序多端同步）';

CREATE TABLE IF NOT EXISTS twin_access_rule_scan_config (
    id INT NOT NULL PRIMARY KEY COMMENT '固定 1 行全局配置',
    enter_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码进入时执行门禁规则大华批量下发',
    exit_dispatch_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码离开时执行门禁规则大华权限回收',
    enter_unfreeze_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码进入时解冻物理卡(大华人员解冻)',
    exit_freeze_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码/自动签退离开时冻结物理卡',
    updated_by VARCHAR(64) NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码进出是否执行门禁规则（大华联动）全局开关';

CREATE TABLE IF NOT EXISTS twin_student_violation (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    target_user_id VARCHAR(64) NOT NULL COMMENT 'ARO 人员 user_id',
    violation_text TEXT NULL COMMENT '违规说明',
    image_urls MEDIUMTEXT NULL COMMENT 'JSON 数组：图片 URL 列表',
    forbid_enter TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=立即禁止扫码进入',
    max_enter_success INT NULL COMMENT '允许的成功「进入」次数上限；达到后禁止进入直至管理员解除',
    enter_success_count INT NOT NULL DEFAULT 0 COMMENT '已成功进入次数累计',
    show_notice_every_scan TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=每次扫码都展示违规通告层',
    expire_at DATETIME NULL COMMENT '到期自动失效；NULL 表示不按天过期',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE, CLEARED, EXPIRED, SUPERSEDED, PROCESSED',
    created_by_user_id VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    cleared_at DATETIME NULL,
    cleared_by_user_id VARCHAR(64) NULL,
    KEY idx_tsv_target_status (target_user_id, status),
    KEY idx_tsv_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生违规记录（扫码弹窗通告与进房限制）';

CREATE TABLE IF NOT EXISTS twin_scan_popup_announcement (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL COMMENT '公告标题',
    content_html MEDIUMTEXT NULL COMMENT '富文本正文（服务端 Jsoup 消毒）',
    enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=参与扫码展示',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '越大越靠前',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE | ARCHIVED',
    publish_at DATETIME NULL COMMENT '最早展示时间；NULL=立即',
    expire_at DATETIME NULL COMMENT '过期时间；NULL=不过期',
    created_by_user_id VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_tspa_status_enabled (status, enabled, sort_order),
    KEY idx_tspa_publish (publish_at, expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='扫码弹窗公告（多条翻页）';
