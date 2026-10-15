package com.example.demo.modules.broadcast.mapper;

import com.example.demo.modules.broadcast.entity.BroadcastPlanZoneState;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface BroadcastPlanZoneStateMapper {

    /** 某个方案下被人工暂停的分区 MAC。调度器下发前用它排除。 */
    List<String> selectPausedMacs(@Param("planId") Long planId);

    /** 全部方案的暂停分区（出参给前端标状态用）。 */
    List<BroadcastPlanZoneState> selectAll();

    /** 标一路为人工暂停 / 取消暂停（存在则改，不存在则插）。 */
    int upsert(@Param("planId") Long planId, @Param("mac") String mac, @Param("paused") Boolean paused);

    /** 窗口结束时清空某方案的覆盖 —— 下一天重新开始，别把昨天的暂停带到今天。 */
    int deleteByPlan(@Param("planId") Long planId);
}
