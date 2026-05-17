-- 目标库见 application.properties 的 spring.datasource.url（如 twin_system）
-- 一次性执行：为扫码门禁联动表增加「进入解冻 / 离开冻结」独立开关列

ALTER TABLE twin_access_rule_scan_config
    ADD COLUMN enter_unfreeze_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码进入时解冻物理卡(大华人员解冻)' AFTER exit_dispatch_enabled;

ALTER TABLE twin_access_rule_scan_config
    ADD COLUMN exit_freeze_enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=扫码/自动签退离开时冻结物理卡' AFTER enter_unfreeze_enabled;
