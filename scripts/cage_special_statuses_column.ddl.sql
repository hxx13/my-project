-- 为 student_cage_shelf_snapshot 表新增特殊状态标记 JSON 列
ALTER TABLE student_cage_shelf_snapshot
    ADD COLUMN special_statuses_json TEXT COMMENT '特殊状态标记JSON数组（合笼/繁殖、特殊饲养、请分笼、健康异常、动物转移）'
    AFTER raw_data_json;
