-- 广播定时方案的运行态：方案是「批量启动器」，启动后每个分区独立可控。
-- IDLE 未运行 / RUNNING 执行中 / PAUSED 已人工暂停（调度器不再自动重发）。
-- 一文件一条 DDL：撞「列已存在」会中止整份脚本，后面的语句永不执行。
ALTER TABLE broadcast_plan ADD COLUMN run_state VARCHAR(16) NOT NULL DEFAULT 'IDLE' COMMENT '运行态：IDLE 未运行 / RUNNING 执行中 / PAUSED 已暂停';
