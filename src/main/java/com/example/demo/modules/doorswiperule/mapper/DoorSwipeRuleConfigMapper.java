package com.example.demo.modules.doorswiperule.mapper;

import com.example.demo.modules.doorswiperule.entity.DoorSwipeRuleConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface DoorSwipeRuleConfigMapper {

    List<DoorSwipeRuleConfig> findByEnabledTrue();

    List<DoorSwipeRuleConfig> findAll();

    DoorSwipeRuleConfig findById(@Param("id") Long id);

    int insert(DoorSwipeRuleConfig rule);

    int update(DoorSwipeRuleConfig rule);

    int deleteById(@Param("id") Long id);
}
