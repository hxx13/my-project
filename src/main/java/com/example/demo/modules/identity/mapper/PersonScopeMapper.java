package com.example.demo.modules.identity.mapper;

import com.example.demo.modules.identity.entity.PersonScope;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/** 人员负责范围 Mapper（由 @MapperScan 扫描，无需 @Mapper 注解）。 */
public interface PersonScopeMapper {
    int insert(PersonScope row);
    int deleteByUser(@Param("userId") String userId);
    List<PersonScope> listByUser(@Param("userId") String userId);
    List<PersonScope> listAll();

    /** 已分配过的人（userId = personnel.id 字符串），带姓名与条目数，按姓名排序。 */
    List<Map<String, Object>> listAssignees();
}
