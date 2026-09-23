-- 归档迁移：动物订购到货周期显式清单
-- 与 src/main/resources/db/bootstrap-ref-order-cycle.sql 同源。
--
-- 为什么需要：到货周期原本是「ETA 策略 + 节假日」推算出来的，管理员只能改策略、不能改具体哪几天。
-- 本表让推算结果可以被「采纳」成显式清单，之后可增删改（用户口径：不要定死）。
-- **表为空 = 该校区仍走推算** —— 所以上线本表不会让任何校区突然没有周期。
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
