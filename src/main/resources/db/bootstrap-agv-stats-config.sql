-- AGV Stats Pipeline: 预设配置（站点分组 + 指标管道）

-- 充电站分组
INSERT INTO agv_stats_config (name, config_type, definition_json, pipeline_slug, is_active) VALUES
('充电站', 'STATION_GROUP',
 '{"stations": ["CP1201", "CP1202", "CP1205"], "tags": ["充电"]}',
 'station-group-charging', 1);

-- 作业站分组（占位，实际站点按部署环境调整）
INSERT INTO agv_stats_config (name, config_type, definition_json, pipeline_slug, is_active) VALUES
('作业站', 'STATION_GROUP',
 '{"stations": ["AP1201", "AP1203"], "tags": ["作业"]}',
 'station-group-working', 1);

-- 默认指标管道（关联上述两个分组）
INSERT INTO agv_stats_config (name, config_type, definition_json, pipeline_slug, is_active) VALUES
('默认管道', 'METRIC_PIPE',
 '{"stationGroups": ["station-group-charging", "station-group-working"], "agvIps": [], "metrics": ["STATION_VISIT_COUNT", "STATION_DWELL_TIME", "TASK_DURATION", "TASK_COUNT", "BATTERY_LEVEL", "ODO_MILEAGE", "STATUS_DISTRIBUTION", "CHARGING_TIME", "BLOCKED_TIME", "EMERGENCY_TIME"]}',
 'default-pipe', 1);
