-- AGV 空间元素：增加 robot_ip 列，支持按小车隔离标签显示
ALTER TABLE agv_spatial_element ADD COLUMN robot_ip VARCHAR(20) NULL COMMENT '所属小车IP，NULL=共享区域（所有同zone车可见）';
CREATE INDEX idx_spatial_robot_ip ON agv_spatial_element (robot_ip);
