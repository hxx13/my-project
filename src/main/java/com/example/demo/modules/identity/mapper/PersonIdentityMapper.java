package com.example.demo.modules.identity.mapper;

import com.example.demo.modules.identity.entity.PersonIdentity;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

/** 人员身份映射 Mapper（由 @MapperScan 扫描，无需 @Mapper 注解）。 */
public interface PersonIdentityMapper {
    int insert(PersonIdentity row);
    int deleteByUser(@Param("userId") String userId);
    List<PersonIdentity> listByUser(@Param("userId") String userId);
    List<PersonIdentity> listAll();
    List<PersonIdentity> listByUserIds(@Param("userIds") Collection<String> userIds);
    int countByTagId(@Param("tagId") Long tagId);
}
