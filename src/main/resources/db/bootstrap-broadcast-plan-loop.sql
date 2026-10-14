-- 广播定时方案加「循环播放」开关。
-- 0 = 播完即停（默认，现状）；1 = 时间窗口内列表播完自动从头循环，直到窗口结束收播。
-- 一文件一条 DDL：撞「列已存在」会中止整份脚本，后面的语句永不执行。
ALTER TABLE broadcast_plan ADD COLUMN loop_play TINYINT(1) NOT NULL DEFAULT 0 COMMENT '循环播放：0 播完即停 / 1 窗口内循环';
