package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageCellHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageCellHistoryMapper {

    int insert(CageCellHistory record);

    List<CageCellHistory> selectByAnimalCageId(@Param("animalCageId") Long animalCageId);

    int deleteById(@Param("id") Long id);
}
