-- 电子签名：每人一份（与 common/schema/V20260925__personnel_signature.sql 同源）
--
-- 唯一键 uk_personnel_signature 就是「签名之后不可更改」的落库保证：
-- 重复提交会撞键，而不是只靠应用层判断（应用层也能被绕过）。
--
-- 为什么存 dataUrl 而不是文件 URL：手机扫码那条路是**公开端点、没有登录态**，
-- 而 POST /api/upload 需要 Bearer JWT —— 公开页传不了文件。且本仓库既有的签名
-- （义务签名、CRF 签名）本来就是 base64 塞文本列，这里沿用同一形态。
CREATE TABLE IF NOT EXISTS personnel_signature (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    personnel_id BIGINT       NOT NULL COMMENT '统一人员 personnel.id',
    image_data   MEDIUMTEXT   NOT NULL COMMENT 'PNG dataUrl（白底、800x300 固定尺寸）',
    source       VARCHAR(16)  NOT NULL DEFAULT 'WEB' COMMENT 'WEB=页面直接画 / MOBILE_LINK=手机扫码画',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_personnel_signature (personnel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='人员电子签名（每人一份，不可更改）';
