package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageInfoCodelistItem;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageInfoCodelistItemMapper {

    List<CageInfoCodelistItem> selectByCodelistId(@Param("codelistId") Long codelistId);

    CageInfoCodelistItem selectById(@Param("id") Long id);

    int countByCodelistId(@Param("codelistId") Long codelistId);

    int countByCodelistIdAndItemCode(@Param("codelistId") Long codelistId, @Param("itemCode") String itemCode);

    Integer selectMaxSortOrder(@Param("codelistId") Long codelistId);

    int insert(CageInfoCodelistItem row);

    int update(CageInfoCodelistItem row);

    int deleteById(@Param("id") Long id);

    int deleteByCodelistId(@Param("codelistId") Long codelistId);
}
