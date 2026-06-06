-- 刷卡失败灵动岛告警规则配置表
-- 由 EmbeddedTwinSystemCoreDdlBootstrap 在启动时执行。

CREATE TABLE IF NOT EXISTS swipe_alert_rule (
  id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(120) NOT NULL COMMENT '规则名称',
  enabled               TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
  channels              JSON DEFAULT NULL COMMENT '通道筛选，null=全通道，如 ["CH01","CH02"]',
  departments           JSON DEFAULT NULL COMMENT '部门筛选，null=全部门，如 ["物理学院","计算机学院"]',
  open_types            VARCHAR(200) DEFAULT '52' COMMENT '触发开门类型，逗号分隔，52=非法刷卡, 0=刷卡失败',
  title_template        VARCHAR(200) DEFAULT '🚨 刷卡失败告警 · ${dept}' COMMENT '通知标题模板，支持 ${dept} ${count} 等变量',
  body_template         VARCHAR(500) DEFAULT '过去 ${windowMin} 分钟内 ${count} 次非法刷卡，涉及：${persons}' COMMENT '通知正文模板',
  threshold_count       INT NOT NULL DEFAULT 3 COMMENT '阈值次数',
  threshold_window_sec  INT NOT NULL DEFAULT 300 COMMENT '滑动窗口（秒）',
  banner_duration_sec   INT NOT NULL DEFAULT 10 COMMENT '横幅显示时长（秒），0=不自动消失',
  min_role_level        INT NOT NULL DEFAULT 4 COMMENT '最低通知角色级别，4=ADMIN',
  cooldown_sec          INT NOT NULL DEFAULT 60 COMMENT '同一规则两次告警最小间隔（秒）',
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='刷卡失败灵动岛告警规则';
