package com.example.demo.modules.avidity.mapper;

import com.example.demo.modules.avidity.entity.AvidityAlarmNotified;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AvidityAlarmNotifiedMapper {

    /**
     * 抢一条去重键。靠唯一键 + INSERT IGNORE 做原子去重：
     * 返回 1 表示这次是首次（该推），返回 0 表示早推过（跳过）。并发下也不会双推。
     */
    int insertIgnore(AvidityAlarmNotified row);

    /** 最近留痕，倒序。 */
    List<AvidityAlarmNotified> selectRecent(@Param("limit") int limit);

    /** 推送失败时把刚抢到的键退回，下一轮重试（否则这条报警就永久漏推了）。 */
    int deleteByKey(@Param("notifyKey") String notifyKey);
}
