-- 电子签名：每人一份 + 限时链接（归档迁移，供服务器手动执行）
--
-- 为什么签名存 dataUrl 而不是文件 URL：手机扫码那条路是公开端点、没有登录态，
-- 而 POST /api/upload 需要 Bearer JWT —— 公开页传不了文件。且本仓库既有的签名
-- （义务签名、CRF 签名）本来就是 base64 塞文本列，这里沿用同一形态。

-- ① 人员电子签名（每人一份）。唯一键就是「签名之后不可更改」的落库保证。
CREATE TABLE IF NOT EXISTS personnel_signature (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    personnel_id BIGINT       NOT NULL COMMENT '统一人员 personnel.id',
    image_data   MEDIUMTEXT   NOT NULL COMMENT 'PNG dataUrl（白底、800x300 固定尺寸）',
    source       VARCHAR(16)  NOT NULL DEFAULT 'WEB' COMMENT 'WEB=页面直接画 / MOBILE_LINK=手机扫码画',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_personnel_signature (personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='人员电子签名（每人一份，不可更改）';

-- ② 限时链接（一次性）。用途：电脑上没法手写，手机扫码打开画自己的签名。
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
