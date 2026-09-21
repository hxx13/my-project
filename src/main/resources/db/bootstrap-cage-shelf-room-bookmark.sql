-- 房间级收藏（笼架信息页左侧树：房间名后面那枚收藏标记）。
--
-- 旧的 cage_shelf_bookmark 是「笼架级」(user_id, room_id, shelve_id)。用户 2026-09-19 定：
-- 收藏粒度改到房间（收藏某个笼架实用性不强），老表**保留只读、不再使用**，也不迁移
-- —— 笼架收藏与房间收藏不是同一件事，硬合会凭空造出用户没收藏过的房间。
--
-- 一条语句一个文件：多条会被前一条的 benign 失败整段跳过且不报错（踩过 Unknown column）。
-- 幂等：CREATE TABLE IF NOT EXISTS。
-- 排序规则跟随 sys_user（utf8mb4_unicode_ci）：user_id 将来若要跟 sys_user.id 对列比较，
-- 跨排序规则会抛 1267（生产库里新老表分属两拨 collation）。
CREATE TABLE IF NOT EXISTS cage_shelf_room_bookmark (
    id         BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    VARCHAR(64) NOT NULL COMMENT '收藏人 accountId（同 sys_user.id 口径）',
    room_id    BIGINT      NOT NULL COMMENT '房间ID',
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_room (user_id, room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='房间级收藏表（笼架信息页左侧树）';
