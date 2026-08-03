package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageCellDetail;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageCellDetailMapper {

    /** 按主键查 */
    CageCellDetail selectByAnimalCageId(@Param("animalCageId") Long animalCageId);

    /** 按主键查并锁定（FOR UPDATE，用于并发控制） */
    CageCellDetail selectByAnimalCageIdForUpdate(@Param("animalCageId") Long animalCageId);

    /** 批量 upsert */
    int batchUpsert(@Param("list") List<CageCellDetail> list);

    /** 按架子查所有笼位详情（JOIN cage_cell_index） */
    List<CageCellDetail> selectByShelfIndexId(@Param("shelfIndexId") Long shelfIndexId);

    /** 批量查 */
    List<CageCellDetail> selectByAnimalCageIds(@Param("ids") List<Long> ids);

    /** 按笼盒编号查（扫码检索用） */
    CageCellDetail selectByCageBoxCode(@Param("code") String code);
}
