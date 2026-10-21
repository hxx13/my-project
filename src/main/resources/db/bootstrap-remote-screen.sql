-- 远程屏幕：把「标签页编号 → 人工名称」持久化。
--
-- 编号由每个浏览器标签页自己生成（sessionStorage），名称是使用者起的（如「电视墙旁那台」）。
-- 不落库的话，后端一重启名称就全丢，每次都要重新命名。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 同源：EmbeddedTwinSystemCoreDdlBootstrap 的 runAllScripts（本文件已在链上注册）。
CREATE TABLE IF NOT EXISTS remote_screen (
    screen_id VARCHAR(64) NOT NULL COMMENT '标签页自己生成的编号',
    owner_user_id VARCHAR(64) NULL COMMENT '登录账号 id —— 远程控制只允许同账号',
    label VARCHAR(128) NOT NULL DEFAULT '' COMMENT '人工名称',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (screen_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='远程屏幕：页签编号与人工名称';
