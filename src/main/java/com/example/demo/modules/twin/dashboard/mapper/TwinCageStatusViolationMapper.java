package com.example.demo.modules.twin.dashboard.mapper;

import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface TwinCageStatusViolationMapper {
    int insert(TwinCageStatusViolation row);
    List<TwinCageStatusViolation> selectAll();
    TwinCageStatusViolation selectById(@Param("id") long id);
    TwinCageStatusViolation selectActiveByRuleAndCage(
        @Param("ruleId") long ruleId,
        @Param("statusCode") String statusCode,
        @Param("cageShelveId") long cageShelveId,
        @Param("positionX") int positionX,
        @Param("positionY") int positionY
    );
    int updateStatus(@Param("id") long id, @Param("status") String status);
    /** 更新笼位/状态等可编辑字段（不改 status/triggered_at） */
    int updateCageFields(TwinCageStatusViolation row);
    int deleteById(@Param("id") long id);
}
