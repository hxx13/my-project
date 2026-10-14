package com.example.demo.modules.broadcast.mapper;

import com.example.demo.modules.broadcast.entity.BroadcastPlan;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface BroadcastPlanMapper {

    List<BroadcastPlan> selectAll();

    List<BroadcastPlan> selectEnabled();

    BroadcastPlan selectById(@Param("id") Long id);

    int insert(BroadcastPlan plan);

    int update(BroadcastPlan plan);

    int deleteById(@Param("id") Long id);

    int toggle(@Param("id") Long id, @Param("enabled") Boolean enabled);

    /** 记一次触发：写最后触发日期/时刻与结果，供「同一天只触发一次」判定。 */
    int markFired(@Param("id") Long id,
                  @Param("firedDate") String firedDate,
                  @Param("firedAt") LocalDateTime firedAt,
                  @Param("result") String result);

    /** 记一次收播：窗口结束后只收一次。 */
    int markStopped(@Param("id") Long id, @Param("stopDate") String stopDate);
}
