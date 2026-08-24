package com.example.demo.modules.cageshelf.mapper;

import com.example.demo.modules.cageshelf.entity.CageInfoFieldDictionary;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CageInfoFieldDictionaryMapper {

    List<CageInfoFieldDictionary> selectAllActive();

    CageInfoFieldDictionary selectByDictKey(@Param("dictKey") String dictKey);

    CageInfoFieldDictionary selectById(@Param("id") Long id);

    int update(CageInfoFieldDictionary row);
}
