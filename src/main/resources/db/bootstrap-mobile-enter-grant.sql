-- 移动端房间自助进入灰度名单。由 EmbeddedTwinSystemCoreDdlBootstrap 启动时执行。
CREATE TABLE IF NOT EXISTS mobile_enter_grant (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(64) NOT NULL COMMENT 'canonical 账号 id（STAFF_ 已折算为 ARO 人员编号）',
  enabled     TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=关闭 1=开启',
  updated_by  VARCHAR(64) DEFAULT NULL COMMENT '最后操作的管理员 id',
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mobile_enter_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='移动端房间自助进入灰度名单';
