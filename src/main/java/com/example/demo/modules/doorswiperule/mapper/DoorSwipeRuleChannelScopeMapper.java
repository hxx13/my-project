package com.example.demo.modules.doorswiperule.mapper;

import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleChannelScope;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DoorSwipeRuleChannelScopeMapper {

    List<DoorSwipeRuleChannelScope> selectAll();

    List<String> enabledChannelCodes();

    DoorSwipeRuleChannelScope findByCode(@Param("channelCode") String channelCode);

    int deleteAll();

    int insertBatch(@Param("items") List<DoorSwipeRuleChannelScope> items);

    int updateEnabled(@Param("channelCode") String channelCode,
                      @Param("enabled") Integer enabled,
                      @Param("updatedBy") String updatedBy);
}
