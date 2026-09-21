package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageVetMessage;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 兽医收件箱（cage_vet_message）的读写。
 * 与老的快照告警链路零耦合；消息由 {@code CageStatusNotifyService} 在发「通知兽医」时落。
 */
public interface CageVetMessageMapper {

    /**
     * 落一条消息。**幂等**：alert_id 上有唯一键，重复触发同一条告警不会堆行
     * （INSERT IGNORE，调用方不必先查）。
     */
    int insertIgnore(@Param("alertId") Long alertId,
                     @Param("animalCageId") Long animalCageId,
                     @Param("statusCode") String statusCode,
                     @Param("firedAt") LocalDateTime firedAt);

    /** 收件箱列表（含定位与课题组，join 三张索引表），最新在前。cageIds 非空时只取这些笼位。 */
    List<CageVetMessage> listMessages(@Param("cageIds") List<Long> cageIds);

    /** 点「已查看」：带 read_at IS NULL 守卫，重复点不覆盖首次查看时刻。 */
    int markRead(@Param("id") long id, @Param("readBy") String readBy);

    /** 一键查看：把当前所有未读一次清掉。 */
    int markAllRead(@Param("readBy") String readBy);

    /** 这些笼位里有未读消息的（网格紫色描边用）。 */
    List<Long> listCageIdsWithUnread(@Param("cageIds") List<Long> cageIds);

    /** 未读条数（入口角标）。 */
    int countUnread();
}
