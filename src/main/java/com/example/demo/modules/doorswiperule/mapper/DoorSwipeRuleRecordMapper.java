package com.example.demo.modules.doorswiperule.mapper;

import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DoorSwipeRuleRecordMapper {

    /** INSERT IGNORE：新记录写入，record_id 已存在则跳过（跨路径去重） */
    int insertIgnore(DoorSwipeRuleRecord record);

    DoorSwipeRuleRecord findByRecordId(@Param("recordId") String recordId);

    List<DoorSwipeRuleRecord> selectPage(@Param("channelCode") String channelCode,
                                         @Param("person") String person,
                                         @Param("openType") Integer openType,
                                         @Param("startTime") String startTime,
                                         @Param("endTime") String endTime,
                                         @Param("limit") int limit,
                                         @Param("offset") int offset);

    long countPage(@Param("channelCode") String channelCode,
                   @Param("person") String person,
                   @Param("openType") Integer openType,
                   @Param("startTime") String startTime,
                   @Param("endTime") String endTime);
}
