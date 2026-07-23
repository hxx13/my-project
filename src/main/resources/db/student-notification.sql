-- 学生端独立通知系统（与教职工 sys_notification 表物理隔离）
CREATE TABLE IF NOT EXISTS sys_student_notification (
    id              VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '通知ID，格式 SNF_xxx',
    title           VARCHAR(255) NOT NULL DEFAULT '' COMMENT '通知标题',
    summary         VARCHAR(2000)         DEFAULT '' COMMENT '通知摘要',
    type            VARCHAR(32)  NOT NULL DEFAULT 'PLATFORM' COMMENT '通知类型: PLATFORM=平台公告, ARO=ARO新闻, WORK_ORDER=工单通知',
    biz_type        VARCHAR(64)           DEFAULT NULL COMMENT '关联业务类型: REPAIR/PURCHASE/SUPPLIES_CLAIM 等',
    biz_id          VARCHAR(128)          DEFAULT NULL COMMENT '关联业务ID',
    recipient_user_id VARCHAR(64) NOT NULL COMMENT '接收学生用户ID',
    source_url       VARCHAR(500)         DEFAULT NULL COMMENT 'ARO 新闻原始链接',
    is_read         TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '0=未读 1=已读',
    read_time       DATETIME              DEFAULT NULL COMMENT '阅读时间',
    create_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_recipient_user (recipient_user_id, is_read, create_time),
    INDEX idx_type (type, create_time),
    INDEX idx_biz (biz_type, biz_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生端独立通知表';
