package com.example.demo.modules.identity.mapper;

import com.example.demo.modules.identity.entity.PersonIdentityTag;
import org.apache.ibatis.annotations.Param;

import java.util.Collection;
import java.util.List;

/** 人员身份标识字典 Mapper（由 @MapperScan 扫描，无需 @Mapper 注解）。 */
public interface PersonIdentityTagMapper {
    int insert(PersonIdentityTag row);
    int update(PersonIdentityTag row);
    PersonIdentityTag findById(@Param("id") Long id);
    PersonIdentityTag findByCode(@Param("code") String code);
    List<PersonIdentityTag> listActive();
    List<PersonIdentityTag> listByIds(@Param("ids") Collection<Long> ids);
    int deleteById(@Param("id") Long id);
}
