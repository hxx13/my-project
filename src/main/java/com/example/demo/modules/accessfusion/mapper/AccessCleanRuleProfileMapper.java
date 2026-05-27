package com.example.demo.modules.accessfusion.mapper;

import com.example.demo.modules.accessfusion.entity.AccessCleanRuleProfile;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface AccessCleanRuleProfileMapper {
    List<AccessCleanRuleProfile> selectAll();

    AccessCleanRuleProfile selectById(@Param("id") long id);

    int insert(AccessCleanRuleProfile row);

    int update(AccessCleanRuleProfile row);

    int deleteById(@Param("id") long id);
}
