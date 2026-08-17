-- 物品图片字段：封面图 + 详情图（对已存在的 inv_item 表补列）
ALTER TABLE inv_item ADD COLUMN cover_url VARCHAR(512) NULL COMMENT '封面图URL';
ALTER TABLE inv_item ADD COLUMN detail_images JSON NULL COMMENT '详情图URL数组';
