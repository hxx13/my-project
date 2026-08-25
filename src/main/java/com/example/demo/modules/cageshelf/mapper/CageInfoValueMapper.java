package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageInfoValue;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageInfoValueMapper {

    List<CageInfoValue> selectByAnimalCageId(@Param("animalCageId") Long animalCageId);

    List<CageInfoValue> selectByAnimalCageIds(@Param("animalCageIds") List<Long> animalCageIds);

    int countByAnimalCageId(@Param("animalCageId") Long animalCageId);

    int upsert(CageInfoValue v);

    int deleteByAnimalCageAndField(@Param("animalCageId") Long animalCageId, @Param("fieldId") Long fieldId);
}
