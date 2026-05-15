package com.example.demo.modules.accessrule.mapper;

import com.example.demo.modules.accessrule.entity.AccessRuleItemUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AccessRuleItemUserMapper {

    int insertBatch(@Param("rows") List<AccessRuleItemUser> rows);

    List<AccessRuleItemUser> selectByItemId(@Param("itemId") long itemId);
}
