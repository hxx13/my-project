package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageTransferLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageTransferLogMapper {

    int insert(CageTransferLog log);

    List<CageTransferLog> selectByFrom(@Param("animalCageId") Long animalCageId);

    List<CageTransferLog> selectByTo(@Param("animalCageId") Long animalCageId);

    List<CageTransferLog> selectByOccupant(@Param("occupantId") String occupantId);
}
