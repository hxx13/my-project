package com.example.demo.modules.animalorder.mapper;

import com.example.demo.modules.animalorder.entity.AnimalOrderTimePolicy;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AnimalOrderTimePolicyMapper {
    AnimalOrderTimePolicy findById(@Param("id") Long id);

    int update(AnimalOrderTimePolicy row);
}
