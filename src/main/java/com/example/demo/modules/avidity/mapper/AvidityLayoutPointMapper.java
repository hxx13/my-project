package com.example.demo.modules.avidity.mapper;

import com.example.demo.modules.avidity.entity.AvidityLayoutPoint;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AvidityLayoutPointMapper {

    List<AvidityLayoutPoint> selectByChannel(@Param("channelId") Long channelId);

    /** 同一个 (通道,房间,笼架,点位号) 只保留一行。 */
    int upsert(AvidityLayoutPoint row);

    /** 恢复默认：删掉该通道某个点位的覆盖。 */
    int delete(@Param("channelId") Long channelId,
               @Param("roomCode") String roomCode,
               @Param("rackCode") String rackCode,
               @Param("pointNo") Integer pointNo);

    /** 恢复默认：清掉该通道全部覆盖。 */
    int deleteByChannel(@Param("channelId") Long channelId);
}
