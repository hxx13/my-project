package com.example.demo.modules.identity.mapper;

import com.example.demo.modules.identity.entity.PersonScope;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 人员负责范围 Mapper（由 @MapperScan 扫描，无需 @Mapper 注解）。 */
public interface PersonScopeMapper {
    int insert(PersonScope row);
    int deleteByUser(@Param("userId") String userId);
    List<PersonScope> listByUser(@Param("userId") String userId);
    List<PersonScope> listAll();
}
