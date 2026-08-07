-- AGV 空间元素：增加小车 IP 归属字段。幂等：bootstrap 的 isBenignInChain 捕获 duplicate column 错误。
ALTER TABLE agv_spatial_element ADD COLUMN robot_ip VARCHAR(20) NULL COMMENT '所属小车 IP，NULL = 共享区域';
ALTER TABLE agv_spatial_element ADD INDEX idx_spatial_robot (robot_ip);
