-- AGV 空间元素：增加行为分析置信度字段
-- source: AUTO(启动导入) | BEHAVIOR(行为分析发现) | MANUAL(手动创建)
ALTER TABLE agv_spatial_element ADD COLUMN confidence DOUBLE NOT NULL DEFAULT 0.5 COMMENT '行为确认置信度 0~1';
ALTER TABLE agv_spatial_element ADD COLUMN hit_count INT NOT NULL DEFAULT 0 COMMENT '被分析命中的总次数';
ALTER TABLE agv_spatial_element ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'AUTO' COMMENT 'AUTO|BEHAVIOR|MANUAL';
