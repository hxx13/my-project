-- 学生违规管理：管理员绑定人员、上传违规说明与图片；扫码弹窗展示并可限制进入次数/天数。
-- 在目标库（见 application.properties spring.datasource.url）执行一次即可。
-- 说明：与 classpath:db/bootstrap-twin-student-violation.sql 同源；默认启动时 EmbeddedTwinSystemCoreDdlBootstrap 也会 IF NOT EXISTS 建表。

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
