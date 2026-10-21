package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageCellHistory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageCellHistoryMapper {

    int insert(CageCellHistory record);

    List<CageCellHistory> selectByAnimalCageId(@Param("animalCageId") Long animalCageId);

    /** 软删除：照片/视频留痕不能物理删（历史里的附件引用会永久丢失）。 */
    int softDeleteById(@Param("id") Long id);
}
