-- 人员回收站：软删除标记 + 操作人（归档迁移，供服务器手动执行）
--
-- 为什么不能直接删行：personnel 是同步派生的。直接 DELETE 后，下一次人员同步会
-- 按 aro_user_id 找不到行 → 重新 INSERT 把他建回来。所以软删除必须让同步"看见但不复活"。
ALTER TABLE personnel ADD COLUMN deleted_at DATETIME NULL COMMENT '回收站：非空表示已软删除';
ALTER TABLE personnel ADD COLUMN deleted_by VARCHAR(64) NULL COMMENT '回收站：执行删除的账号 id';
