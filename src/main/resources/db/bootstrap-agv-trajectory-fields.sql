-- AGV 轨迹表 — 补充缺失字段。幂等：bootstrap 的 isBenignInChain 捕获 duplicate column 错误。
ALTER TABLE agv_trajectory ADD COLUMN reloc_status   INT          NULL COMMENT '重定位状态';
ALTER TABLE agv_trajectory ADD COLUMN loadmap_status INT          NULL COMMENT '地图加载状态';
ALTER TABLE agv_trajectory ADD COLUMN rssi           INT          NULL COMMENT 'WiFi 信号强度';
ALTER TABLE agv_trajectory ADD COLUMN ssid           VARCHAR(64)  NULL COMMENT 'WiFi SSID';
ALTER TABLE agv_trajectory ADD COLUMN driver_emc     TINYINT(1)   NULL COMMENT '驱动EMC';
ALTER TABLE agv_trajectory ADD COLUMN fork_height    DOUBLE       NULL COMMENT '叉臂高度';
ALTER TABLE agv_trajectory ADD COLUMN jack_enable    TINYINT(1)   NULL COMMENT '顶升使能';
ALTER TABLE agv_trajectory ADD COLUMN jack_error_code INT         NULL COMMENT '顶升错误码';
ALTER TABLE agv_trajectory ADD COLUMN jack_isFull    TINYINT(1)   NULL COMMENT '顶升满载';
ALTER TABLE agv_trajectory ADD COLUMN jack_mode      TINYINT(1)   NULL COMMENT '顶升模式';
ALTER TABLE agv_trajectory ADD COLUMN jack_state     INT          NULL COMMENT '顶升状态';
ALTER TABLE agv_trajectory ADD COLUMN total_time     BIGINT       NULL COMMENT '总运行时间(ms)';
ALTER TABLE agv_trajectory ADD COLUMN robot_note     VARCHAR(256) NULL COMMENT '机器人备注';
ALTER TABLE agv_trajectory ADD COLUMN di_json        TEXT         NULL COMMENT 'DI数字输入通道JSON';
ALTER TABLE agv_trajectory ADD COLUMN notices_json   TEXT         NULL COMMENT '通知列表JSON';
ALTER TABLE agv_trajectory ADD COLUMN ret_code       INT          NULL COMMENT 'AGV返回码';
ALTER TABLE agv_trajectory ADD COLUMN create_on_agv   VARCHAR(64)  NULL COMMENT 'AGV侧时间戳';
