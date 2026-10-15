package com.example.demo.modules.avidity.mapper;

import com.example.demo.modules.avidity.entity.AvidityAlarmRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AvidityAlarmRuleMapper {

    List<AvidityAlarmRule> selectAll();

    AvidityAlarmRule selectByCode(@Param("ruleCode") String ruleCode);

    int update(@Param("ruleCode") String ruleCode,
               @Param("enabled") boolean enabled,
               @Param("thresholdCount") Integer thresholdCount);
}
