package com.example.demo.modules.twin.dashboard.mapper;

import com.example.demo.modules.twin.dashboard.entity.TwinCageStatusViolation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

@Mapper
public interface TwinCageStatusViolationMapper {
    int insert(TwinCageStatusViolation row);
    List<TwinCageStatusViolation> selectAll();

    /** 每个父记录的成员数（cnt=全部子记录, activeCnt=ACTIVE 子记录）；列表一次性聚合，替代前端 N+1 逐父计数 */
    List<Map<String, Object>> countMembersByCage();
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
