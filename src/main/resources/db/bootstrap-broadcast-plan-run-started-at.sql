-- 广播方案本轮的开始时刻。
-- 用途：顶部「正在执行」条要显示这一轮是从什么时候跑起来的（现场反馈过「看不出计划在什么时候跑的」）。
-- 一文件一条 DDL：撞「列已存在」会中止整份脚本，后面的语句永不执行。
ALTER TABLE broadcast_plan ADD COLUMN run_started_at DATETIME NULL COMMENT '本轮开始时刻（转 RUNNING 时刷新）';
