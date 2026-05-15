package com.example.demo.modules.twin.mapper;

import com.example.demo.modules.twin.entity.TwinAccessCorrelationPending;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface TwinAccessCorrelationPendingMapper {

    int insert(TwinAccessCorrelationPending row);

    TwinAccessCorrelationPending selectOldestMatching(
            @Param("userId") String userId,
            @Param("roomId") String roomId,
            @Param("accessType") int accessType,
            @Param("opTimeMin") LocalDateTime opTimeMin,
            @Param("opTimeMax") LocalDateTime opTimeMax
    );

    int markConsumed(@Param("id") long id);
}
