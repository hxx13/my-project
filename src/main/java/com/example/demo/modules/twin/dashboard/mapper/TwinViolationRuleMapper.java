package com.example.demo.modules.twin.dashboard.mapper;

import com.example.demo.modules.twin.dashboard.entity.TwinViolationRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TwinViolationRuleMapper {

    List<TwinViolationRule> selectAll();

    TwinViolationRule selectById(@Param("id") long id);

    TwinViolationRule selectByCode(@Param("ruleCode") String ruleCode);

    int insert(TwinViolationRule row);

    int updateById(TwinViolationRule row);

    int deleteById(@Param("id") long id);

    /** 检查是否有违规记录关联此规则 */
    int countViolationsByRuleId(@Param("ruleId") long ruleId);

    /**
     * 按人+规则+时间窗口统计违规记录数（所有状态）。
     */
    int countViolationsInWindow(
            @Param("targetUserId") String targetUserId,
            @Param("ruleId") long ruleId,
            @Param("windowStart") LocalDateTime windowStart);
}
