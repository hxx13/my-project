-- 首页大屏「隐藏浦西相关渲染」开关（模块 frontend_runtime，公开给前端读取）
-- 幂等：已存在同 module + config_key 的定义则跳过
INSERT INTO sys_system_config_def
    (module, config_key, label_zh, description, value_type, options_json, default_value,
     is_sensitive, requires_restart, is_public, update_time)
SELECT 'frontend_runtime',
       'dashboard.hide_puxi',
       '隐藏浦西相关渲染',
       '开启后，首页大屏不再展示浦西相关信息：实时流水不显示浦西进出记录，滞留监控隐藏浦西切换页签，排行榜去掉浦西区域，房间分布与进出高峰曲线不再绘制浦西数据。',
       'BOOLEAN',
       NULL,
       'false',
       0, 0, 1, NOW()
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM sys_system_config_def
    WHERE module = 'frontend_runtime' AND config_key = 'dashboard.hide_puxi'
);
