package com.example.demo.modules.accessrule.mapper;

import com.example.demo.modules.accessrule.entity.AccessRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AccessRuleMapper {

    int insert(AccessRule row);

    int updateRuleCode(@Param("id") long id, @Param("ruleCode") String ruleCode);

    int updateMeta(@Param("id") long id, @Param("name") String name, @Param("enabled") int enabled);

    int deleteById(@Param("id") long id);

    AccessRule selectById(@Param("id") long id);

    long countList(@Param("keyword") String keyword);

    List<AccessRule> selectPage(@Param("keyword") String keyword, @Param("offset") int offset, @Param("limit") int limit);
}
