package com.example.demo.modules.cageshelf.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 房间级收藏（笼架信息页左侧树：房间名后面那枚收藏标记）。
 *
 * <p>与笼架级的 {@link CageShelfBookmarkMapper} 并存：那张老表 (user_id, room_id, shelve_id)
 * 按 2026-09-19 口径保留只读、不再写入，也不迁移（笼架收藏 ≠ 房间收藏）。
 */
@Mapper
public interface CageShelfRoomBookmarkMapper {

    /** 该用户收藏过的房间 id（按收藏先后）。前端拿它自己跟树里的房间对齐 —— 房间名/层级前端本来就有。 */
    List<Long> selectRoomIdsByUserId(@Param("userId") String userId);

    /** INSERT IGNORE：并发重复点收藏只会有一条（唯一键 uk_user_room 兜住）。 */
    int insert(@Param("userId") String userId, @Param("roomId") Long roomId);

    int delete(@Param("userId") String userId, @Param("roomId") Long roomId);
}
