package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageDivision;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 笼位划分 Mapper（由 @MapperScan 扫描）。 */
public interface CageDivisionMapper {
    int insert(CageDivision row);
    int deleteByCageIds(@Param("cageIds") List<Long> cageIds);
    int deleteByCageAndAssignee(@Param("animalCageId") Long animalCageId,
                               @Param("assigneeIds") List<String> assigneeIds);
    List<CageDivision> listAll();
    List<CageDivision> listByCageIds(@Param("cageIds") List<Long> cageIds);
}
