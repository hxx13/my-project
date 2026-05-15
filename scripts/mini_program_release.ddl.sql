-- twin_system：小程序版本 / 首屏公告（与 MiniProgramReleaseMapper.xml 一致）
-- 在目标库执行：USE twin_system; 然后 SOURCE 本文件，或用客户端粘贴执行。

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
