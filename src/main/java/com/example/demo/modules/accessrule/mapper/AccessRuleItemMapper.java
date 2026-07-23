package com.example.demo.modules.accessrule.mapper;

import com.example.demo.modules.accessrule.entity.AccessRuleItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AccessRuleItemMapper {

    int insert(AccessRuleItem row);

    int deleteByRuleId(@Param("ruleId") long ruleId);

    List<AccessRuleItem> selectByRuleId(@Param("ruleId") long ruleId);

    /**
     * 扫码：启用规则下，按房间+人员命中一条子项。
     */
    AccessRuleItem selectMatchingItem(@Param("roomId") String roomId, @Param("aroUserId") String aroUserId);
}
