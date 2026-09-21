-- 电子签名限时链接（与 common/schema/V20260925__personnel_signature.sql 同源）
--
-- 用途：电脑上没法手写，生成一条限时链接用手机扫码打开，在手机上画自己的签名。
-- 一次性：POST 成功后置 consumed_at，链接随即失效。
CREATE TABLE IF NOT EXISTS signature_link (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    token        VARCHAR(64) NOT NULL,
    personnel_id BIGINT      NOT NULL COMMENT '被签人 personnel.id',
    expires_at   DATETIME    NOT NULL,
    consumed_at  DATETIME    NULL COMMENT '非空表示已用掉（链接失效）',
    created_by   VARCHAR(64) NULL COMMENT '生成人账号 id',
    created_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_signature_link_token (token),
    KEY idx_signature_link_personnel (personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='电子签名限时链接（一次性）';
