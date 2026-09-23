-- 动物订购到货周期（显式清单）
-- 周期原本是按 ETA 策略 + 节假日**推算**出来的；本表让它可被管理员「采纳」后成为显式清单，
-- 之后可增删改。表为空 = 该校区仍走推算（未配置的校区行为不变，不会因为上线本表而空掉）。
-- ⚠️ 一个文件一条 DDL —— 见 bootstrap-ref-cart-target-cage.sql 的说明。
CREATE TABLE IF NOT EXISTS animal_order_cycle (
    id          BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    campus      VARCHAR(32) NOT NULL COMMENT '浦东 | 浦西',
    cycle_date  DATE        NOT NULL COMMENT '到货周期日（预计到货日）',
    sort_order  INT         NOT NULL DEFAULT 0,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_cycle_campus_date (campus, cycle_date),
    KEY idx_cycle_campus (campus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动物订购到货周期显式清单（空=按 ETA 策略推算）';
