package com.example.demo.modules.animalorder.mapper;

import com.example.demo.modules.animalorder.entity.AnimalOrderWindowRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface AnimalOrderWindowRuleMapper {
    List<AnimalOrderWindowRule> listActive();

    List<AnimalOrderWindowRule> listActiveByScope(@Param("scope") String scope, @Param("categoryKey") String categoryKey);

    int insert(AnimalOrderWindowRule row);

    int update(AnimalOrderWindowRule row);

    int softDelete(@Param("id") Long id);
}
